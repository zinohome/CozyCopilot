import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const SESSION_ID = "00000000-0000-0000-0000-000000000001";
const BEARER = "Bearer test-jwt";

const validBody = {
  session_id: SESSION_ID,
  turns: [{ role: "user", text: "hi" }],
};

function makeReq(body: unknown, auth: string | null = BEARER): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  return new Request("http://localhost/api/cozy/chat/voice-summary", {
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

describe("POST /api/cozy/chat/voice-summary", () => {
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

  it("returns 400 VALIDATION_ERROR on invalid JSON", async () => {
    const res = await POST(makeReq("not-json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 with details.turns when turns is empty", async () => {
    const res = await POST(makeReq({ session_id: SESSION_ID, turns: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("turns");
  });

  it("returns 400 with details.turns when turns exceeds 200", async () => {
    const turns = Array.from({ length: 201 }, () => ({ role: "user", text: "x" }));
    const res = await POST(makeReq({ session_id: SESSION_ID, turns }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("turns");
  });

  it("returns 400 with details.turns.0.text when a turn has empty text", async () => {
    const res = await POST(
      makeReq({ session_id: SESSION_ID, turns: [{ role: "user", text: "" }] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("turns.0.text");
  });

  it("forwards to CozyEngineV2 and returns envelope on 200", async () => {
    installFetchMock(200, { saved_message_ids: ["m-1", "m-2"] });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { saved_message_ids: ["m-1", "m-2"] } });
  });
});
