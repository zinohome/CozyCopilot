import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Request as UndiciRequest, FormData as UndiciFormData } from "undici";
import { POST } from "./route";

const SESSION_ID = "00000000-0000-0000-0000-000000000001";
const PERSONALITY_ID = "00000000-0000-0000-0000-000000000002";
const BEARER = "Bearer test-jwt";

// jsdom (vitest's default env) installs a broken Request/FormData polyfill
// that doesn't support multipart parsing — `req.formData()` on a Request
// built from FormData throws "Content-Type was not one of multipart/
// form-data". We import the real undici implementations to construct test
// Requests the route can actually parse. Node 18+ provides a working global
// Blob, so we use that directly.
function makeMultipartRequest(
  fields: Record<string, string | Blob>,
  auth: string | null = BEARER,
): NextRequest {
  const form = new UndiciFormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;
  return new UndiciRequest("http://localhost/api/cozy/chat/voice", {
    method: "POST",
    headers,
    body: form,
  }) as unknown as NextRequest;
}

function makeFakeAudio(): Blob {
  return new globalThis.Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchMock(status: number, body: unknown) {
  return vi
    .spyOn(global, "fetch")
    .mockImplementation((async () =>
      typeof body === "string" ? new Response(body, { status }) : jsonResponse(body, status)) as typeof fetch);
}

describe("POST /api/cozy/chat/voice (multipart)", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization header with 401 UNAUTHORIZED", async () => {
    const res = await POST(
      makeMultipartRequest(
        {
          session_id: SESSION_ID,
          personality_id: PERSONALITY_ID,
          audio: makeFakeAudio(),
        },
        null,
      ),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 with details.session_id when session_id is missing", async () => {
    const res = await POST(
      makeMultipartRequest({
        personality_id: PERSONALITY_ID,
        audio: makeFakeAudio(),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("session_id");
  });

  it("returns 400 'missing audio file' when audio field is absent", async () => {
    const res = await POST(
      makeMultipartRequest({
        session_id: SESSION_ID,
        personality_id: PERSONALITY_ID,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("missing audio file");
  });

  it("returns 400 with details.session_id when session_id is not a uuid", async () => {
    const res = await POST(
      makeMultipartRequest({
        session_id: "not-a-uuid",
        personality_id: PERSONALITY_ID,
        audio: makeFakeAudio(),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("session_id");
  });

  it("returns 400 'missing audio file' when audio field is a string (not a Blob)", async () => {
    const res = await POST(
      makeMultipartRequest({
        session_id: SESSION_ID,
        personality_id: PERSONALITY_ID,
        audio: "just-a-string",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("missing audio file");
  });

  it("forwards to CozyEngineV2 with all 3 FormData fields and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      transcript: "hello there",
      reply_text: "hi!",
      reply_audio_url: "https://cdn.example.com/r.ogg",
      message_id: "msg-1",
    });

    const res = await POST(
      makeMultipartRequest({
        session_id: SESSION_ID,
        personality_id: PERSONALITY_ID,
        audio: makeFakeAudio(),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        transcript: "hello there",
        reply_text: "hi!",
        reply_audio_url: "https://cdn.example.com/r.ogg",
        message_id: "msg-1",
      },
    });

    // Verify fetch was called with the right URL and a FormData body that
    // contains all 3 fields. fetch is responsible for the multipart
    // boundary (Content-Type is intentionally NOT set by the route).
    const [url, init] = mock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/v1/voice/chat");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(BEARER);
    // Critical: Content-Type must NOT be set — fetch computes it with the boundary.
    expect(headers["Content-Type"]).toBeUndefined();
    const sentForm = init?.body as FormData;
    expect(sentForm).toBeInstanceOf(FormData);
    expect(sentForm.get("session_id")).toBe(SESSION_ID);
    expect(sentForm.get("personality_id")).toBe(PERSONALITY_ID);
    expect(sentForm.get("audio")).toBeInstanceOf(Blob);
  });

  it("maps upstream 401 to 401 UNAUTHORIZED via errorResponseFromUpstream", async () => {
    installFetchMock(401, { code: "UNAUTHORIZED", message: "expired" });
    const res = await POST(
      makeMultipartRequest({
        session_id: SESSION_ID,
        personality_id: PERSONALITY_ID,
        audio: makeFakeAudio(),
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("maps upstream 500 with PROVIDER_UNAVAILABLE code to 500 PROVIDER_UNAVAILABLE", async () => {
    installFetchMock(500, { code: "PROVIDER_UNAVAILABLE", message: "stt down" });
    const res = await POST(
      makeMultipartRequest({
        session_id: SESSION_ID,
        personality_id: PERSONALITY_ID,
        audio: makeFakeAudio(),
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });
});
