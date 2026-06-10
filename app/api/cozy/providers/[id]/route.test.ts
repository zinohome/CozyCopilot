import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH } from "./route";

const PROVIDER_ID = "pr-00000000-0000-0000-0000-000000000001";
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

function providerParams(id: string = PROVIDER_ID) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/cozy/providers/[id]", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await GET(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, { auth: null }),
      providerParams(),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("forwards id from URL path to upstream and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      id: PROVIDER_ID,
      label: "OpenAI",
      base_url: "https://api.openai.com",
      model: "gpt-4o",
      is_default: true,
      created_at: "2026-01-01T00:00:00Z",
    });
    const res = await GET(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, { auth: BEARER }),
      providerParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(PROVIDER_ID);
    expect(String(mock.mock.calls[0]?.[0])).toContain(`/v1/users/me/providers/${PROVIDER_ID}`);
  });

  it("maps upstream 404 to 404 NOT_FOUND", async () => {
    installFetchMock(404, { code: "NOT_FOUND", message: "missing" });
    const res = await GET(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, { auth: BEARER }),
      providerParams(),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("maps upstream 500 with empty body to 500 PROVIDER_UNAVAILABLE", async () => {
    installFetchMock(500, "");
    const res = await GET(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, { auth: BEARER }),
      providerParams(),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });
});

describe("PATCH /api/cozy/providers/[id]", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await PATCH(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
        method: "PATCH",
        auth: null,
        body: JSON.stringify({ label: "x" }),
      }),
      providerParams(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR on empty body (refine fails)", async () => {
    const res = await PATCH(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
        method: "PATCH",
        auth: BEARER,
        body: JSON.stringify({}),
      }),
      providerParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 with details.base_url when base_url is not a url", async () => {
    const res = await PATCH(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
        method: "PATCH",
        auth: BEARER,
        body: JSON.stringify({ base_url: "bad" }),
      }),
      providerParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("base_url");
  });

  it("returns 400 with details.api_key when api_key is empty", async () => {
    const res = await PATCH(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
        method: "PATCH",
        auth: BEARER,
        body: JSON.stringify({ api_key: "" }),
      }),
      providerParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("api_key");
  });

  it("forwards valid body to upstream with id and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      id: PROVIDER_ID,
      label: "renamed",
      base_url: "https://api.openai.com",
      model: "gpt-4o",
      is_default: true,
      updated_at: "2026-01-02T00:00:00Z",
    });
    const res = await PATCH(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
        method: "PATCH",
        auth: BEARER,
        body: JSON.stringify({ label: "renamed" }),
      }),
      providerParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        id: PROVIDER_ID,
        label: "renamed",
        base_url: "https://api.openai.com",
        model: "gpt-4o",
        is_default: true,
        updated_at: "2026-01-02T00:00:00Z",
      },
    });
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ label: "renamed" });
    expect(String(mock.mock.calls[0]?.[0])).toContain(`/v1/users/me/providers/${PROVIDER_ID}`);
  });

  it("forwards the Authorization header verbatim to upstream", async () => {
    const mock = installFetchMock(200, {
      id: PROVIDER_ID,
      label: "renamed",
      base_url: "https://x",
      model: "m",
      is_default: false,
      updated_at: "2026-01-02T00:00:00Z",
    });
    await PATCH(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
        method: "PATCH",
        auth: BEARER,
        body: JSON.stringify({ label: "renamed" }),
      }),
      providerParams(),
    );
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
  });
});

describe("DELETE /api/cozy/providers/[id]", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
        method: "DELETE",
        auth: null,
      }),
      providerParams(),
    );
    expect(res.status).toBe(401);
  });

  it("forwards DELETE to upstream and returns envelope on 200", async () => {
    const mock = installFetchMock(200, { id: PROVIDER_ID, deleted: true });
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
        method: "DELETE",
        auth: BEARER,
      }),
      providerParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { id: PROVIDER_ID, deleted: true } });
    expect(String(mock.mock.calls[0]?.[0])).toContain(`/v1/users/me/providers/${PROVIDER_ID}`);
  });

  it("maps upstream 404 to 404 NOT_FOUND", async () => {
    installFetchMock(404, { code: "NOT_FOUND", message: "missing" });
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
        method: "DELETE",
        auth: BEARER,
      }),
      providerParams(),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("maps upstream 409 with PROVIDER_IN_USE to 409 PROVIDER_IN_USE", async () => {
    installFetchMock(409, {
      code: "PROVIDER_IN_USE",
      message: "referenced by 3 sessions",
    });
    const res = await DELETE(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
        method: "DELETE",
        auth: BEARER,
      }),
      providerParams(),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_IN_USE");
    expect(body.error.message).toBe("referenced by 3 sessions");
  });

  it("passes id from URL path to upstream DELETE call", async () => {
    const mock = installFetchMock(200, { id: PROVIDER_ID, deleted: true });
    await DELETE(
      makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
        method: "DELETE",
        auth: BEARER,
      }),
      providerParams(),
    );
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(String(mock.mock.calls[0]?.[0])).toContain(`/v1/users/me/providers/${PROVIDER_ID}`);
  });
});
