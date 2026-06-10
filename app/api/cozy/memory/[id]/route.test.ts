import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "./route";

const MEMORY_ID = "mem-abc-123";
const BEARER = "Bearer test-jwt";

function makeReq(
  url: string,
  init: { method?: string; auth?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.auth) headers.Authorization = init.auth;
  return new Request(url, {
    method: init.method ?? "DELETE",
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

function memoryParams(id: string = MEMORY_ID) {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/cozy/memory/[id]", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/memory/${MEMORY_ID}`, { auth: null }),
      memoryParams(),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("forwards id from URL path to upstream and returns envelope on 200", async () => {
    const mock = installFetchMock(200, { id: MEMORY_ID, deleted: true });
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/memory/${MEMORY_ID}`, { auth: BEARER }),
      memoryParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { id: MEMORY_ID, deleted: true } });
    expect(String(mock.mock.calls[0]?.[0])).toContain(`/api/v1/memories/${MEMORY_ID}`);
  });

  it("maps upstream 404 (memory not found) to 404 NOT_FOUND", async () => {
    installFetchMock(404, { code: "NOT_FOUND", message: "memory gone" });
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/memory/${MEMORY_ID}`, { auth: BEARER }),
      memoryParams(),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("maps upstream 401 (CozyMemory rejected the service key) to 401 UNAUTHORIZED", async () => {
    installFetchMock(401, { code: "UNAUTHORIZED", message: "bad service key" });
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/memory/${MEMORY_ID}`, { auth: BEARER }),
      memoryParams(),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("includes Authorization header in upstream call (dual-auth pattern)", async () => {
    const mock = installFetchMock(200, { id: MEMORY_ID, deleted: true });
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/memory/${MEMORY_ID}`, { auth: BEARER }),
      memoryParams(),
    );
    expect(res.status).toBe(200);
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(BEARER);
    expect(headers["X-Cozy-API-Key"]).toBeDefined();
  });
});
