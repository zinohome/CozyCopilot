import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const SESSION_ID = "00000000-0000-0000-0000-000000000001";
const BEARER = "Bearer test-jwt";

const validBody = {
  session_id: SESSION_ID,
  turns: [
    {
      role: "user" as const,
      text: "Hello",
      at: "2026-06-17T10:00:00.000Z",
    },
    {
      role: "assistant" as const,
      text: "Hi there",
      at: "2026-06-17T10:00:01.000Z",
    },
  ],
  tool_calls: [
    {
      name: "lookup",
      arguments: { q: "weather" },
      result: { temp: 20 },
    },
  ],
};

function makeReq(body: unknown, auth: string | null = BEARER): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  return new Request("http://localhost/api/cozy/voice/summary", {
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

describe("POST /api/cozy/voice/summary", () => {
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

  it("returns 400 VALIDATION_ERROR when session_id is missing", async () => {
    const { session_id: _omit, ...withoutSession } = validBody;
    const res = await POST(makeReq(withoutSession));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("session_id");
  });

  it("returns 400 VALIDATION_ERROR when turns[0].role is not user/assistant", async () => {
    const res = await POST(
      makeReq({
        ...validBody,
        turns: [
          { role: "system", text: "Hi", at: "2026-06-17T10:00:00.000Z" },
        ],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("turns.0.role");
  });

  it("forwards to CozyEngineV2 /v1/chat/voice_summary and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      session_id: SESSION_ID,
      message_ids: ["m1", "m2"],
    });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        session_id: SESSION_ID,
        message_ids: ["m1", "m2"],
      },
    });
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(String(mock.mock.calls[0]?.[0])).toContain("/v1/chat/voice_summary");
  });
});
