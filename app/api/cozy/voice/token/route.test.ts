import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const SESSION_ID = "00000000-0000-0000-0000-000000000001";
const PERSONALITY_ID = "00000000-0000-0000-0000-000000000002";
const BEARER = "Bearer test-jwt";

const validBody = {
  session_id: SESSION_ID,
  personality_id: PERSONALITY_ID,
};

function makeReq(body: unknown, auth: string | null = BEARER): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  return new Request("http://localhost/api/cozy/voice/token", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
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

describe("POST /api/cozy/voice/token", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization header with 401 UNAUTHORIZED", async () => {
    const res = await POST(makeReq(validBody, null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects non-Bearer Authorization header with 401 UNAUTHORIZED", async () => {
    const res = await POST(makeReq(validBody, "Basic dXNlcjpwYXNz"));
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR on invalid JSON", async () => {
    const res = await POST(makeReq("not-json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 with details.personality_id when personality_id is not a uuid", async () => {
    const res = await POST(
      makeReq({ session_id: SESSION_ID, personality_id: "bad" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("personality_id");
  });

  it("forwards to CozyEngineV2 with Authorization header and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      token: "livekit-jwt",
      url: "wss://livekit.example.com",
      room: "session-room",
      expires_at: "2026-06-10T12:00:00Z",
    });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        token: "livekit-jwt",
        url: "wss://livekit.example.com",
        room: "session-room",
        expires_at: "2026-06-10T12:00:00Z",
      },
    });
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(String(mock.mock.calls[0]?.[0])).toContain("/v1/voice/token");
  });

  it("maps upstream 503 (LiveKit down) to 503 PROVIDER_UNAVAILABLE via status mapping", async () => {
    installFetchMock(503, "");

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(body.error.retryable).toBe(true);
  });
});
