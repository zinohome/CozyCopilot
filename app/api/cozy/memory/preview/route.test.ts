import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const BEARER = "Bearer test-jwt";

function makeReq(auth: string | null = BEARER): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;
  return new Request("http://localhost/api/cozy/memory/preview", {
    method: "GET",
    headers,
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

describe("GET /api/cozy/memory/preview", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization header with 401 UNAUTHORIZED", async () => {
    const res = await GET(makeReq(null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("forwards to CozyMemory with X-Cozy-API-Key service key and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      short_term: [],
      long_term: [{ id: "lt-1", content: "user likes tea" }],
      profile: { name: "Alice" },
      knowledge: [],
      errors: [],
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        short_term: [],
        long_term: [{ id: "lt-1", content: "user likes tea" }],
        profile: { name: "Alice" },
        knowledge: [],
        errors: [],
      },
    });
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Cozy-API-Key"]).toBe("");
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(String(mock.mock.calls[0]?.[0])).toContain("/api/v1/context");
  });

  it("maps upstream 401 (CozyMemory rejected the service key) to 401 UNAUTHORIZED", async () => {
    installFetchMock(401, { code: "UNAUTHORIZED", message: "bad service key" });
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("maps upstream 500 (CozyMemory down) to 500 PROVIDER_UNAVAILABLE", async () => {
    installFetchMock(500, "");
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(body.error.retryable).toBe(true);
  });
});
