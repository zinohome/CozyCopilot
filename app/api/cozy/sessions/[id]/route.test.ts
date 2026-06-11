import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH } from "./route";

const SESSION_ID = "00000000-0000-0000-0000-000000000001";
const BEARER = "Bearer test-jwt";

function makeReq(
  url: string,
  init: { method?: string; body?: string; auth?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.auth) headers.Authorization = init.auth;
  return new Request(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
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

function sessionParams(id: string = SESSION_ID) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/cozy/sessions/[id]", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await GET(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, { auth: null }),
      sessionParams(),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("forwards id from URL path to upstream and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      id: SESSION_ID,
      title: "t",
      personality_id: null,
      messages: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    const res = await GET(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, { auth: BEARER }),
      sessionParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(SESSION_ID);
    expect(String(mock.mock.calls[0]?.[0])).toContain(`/v1/sessions/${SESSION_ID}`);
  });

  it("maps upstream 404 with NOT_FOUND code to 404 NOT_FOUND", async () => {
    installFetchMock(404, { code: "NOT_FOUND", message: "missing" });
    const res = await GET(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, { auth: BEARER }),
      sessionParams(),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("maps upstream 400 with SESSION_CLOSED code to 400 SESSION_CLOSED", async () => {
    installFetchMock(400, { code: "SESSION_CLOSED", message: "ended" });
    const res = await GET(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, { auth: BEARER }),
      sessionParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("SESSION_CLOSED");
  });
});

describe("PATCH /api/cozy/sessions/[id]", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await PATCH(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
        method: "PATCH",
        auth: null,
        body: JSON.stringify({ title: "x" }),
      }),
      sessionParams(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR on empty body (refine fails)", async () => {
    const res = await PATCH(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
        method: "PATCH",
        auth: BEARER,
        body: JSON.stringify({}),
      }),
      sessionParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 with details.personality_id when not a uuid", async () => {
    const res = await PATCH(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
        method: "PATCH",
        auth: BEARER,
        body: JSON.stringify({ personality_id: "not-a-uuid" }),
      }),
      sessionParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("personality_id");
  });

  it("returns 400 with details.title when title is too long", async () => {
    const res = await PATCH(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
        method: "PATCH",
        auth: BEARER,
        body: JSON.stringify({ title: "x".repeat(201) }),
      }),
      sessionParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("title");
  });

  it("forwards valid body to upstream and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      id: SESSION_ID,
      title: "renamed",
      personality_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    const res = await PATCH(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
        method: "PATCH",
        auth: BEARER,
        body: JSON.stringify({ title: "renamed" }),
      }),
      sessionParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        id: SESSION_ID,
        title: "renamed",
        personality_id: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      },
    });
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ title: "renamed" });
    expect(String(mock.mock.calls[0]?.[0])).toContain(`/v1/sessions/${SESSION_ID}`);
  });
});

describe("DELETE /api/cozy/sessions/[id]", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
        method: "DELETE",
        auth: null,
      }),
      sessionParams(),
    );
    expect(res.status).toBe(401);
  });

  it("forwards DELETE to upstream and returns envelope on 200", async () => {
    const mock = installFetchMock(200, { id: SESSION_ID, deleted: true });
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
        method: "DELETE",
        auth: BEARER,
      }),
      sessionParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { id: SESSION_ID, deleted: true } });
    expect(String(mock.mock.calls[0]?.[0])).toContain(`/v1/sessions/${SESSION_ID}`);
  });

  it("maps upstream 404 to 404 NOT_FOUND", async () => {
    installFetchMock(404, { code: "NOT_FOUND", message: "missing" });
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
        method: "DELETE",
        auth: BEARER,
      }),
      sessionParams(),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
