import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const PERSONALITY_ID = "00000000-0000-0000-0000-000000000001";
const BEARER = "Bearer test-jwt";

function makeReq(
  url: string,
  init: { method?: string; body?: string; auth?: string | null },
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

describe("GET /api/cozy/sessions", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await GET(makeReq("http://localhost/api/cozy/sessions", { auth: null }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("forwards GET to CozyEngineV2 and returns envelope on 200", async () => {
    const sessions = [
      {
        id: "s-1",
        title: "t",
        personality_id: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        message_count: 0,
      },
    ];
    installFetchMock(200, { sessions });

    const res = await GET(
      makeReq("http://localhost/api/cozy/sessions", { method: "GET", auth: BEARER }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { sessions } });
  });

  it("forwards the Authorization header verbatim to upstream", async () => {
    const mock = installFetchMock(200, { sessions: [] });
    await GET(makeReq("http://localhost/api/cozy/sessions", { method: "GET", auth: BEARER }));
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
  });

  it("maps upstream 401 to 401 UNAUTHORIZED", async () => {
    installFetchMock(401, { code: "UNAUTHORIZED", message: "expired" });
    const res = await GET(
      makeReq("http://localhost/api/cozy/sessions", { method: "GET", auth: BEARER }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("maps upstream 500 with empty body to 500 PROVIDER_UNAVAILABLE", async () => {
    installFetchMock(500, "");
    const res = await GET(
      makeReq("http://localhost/api/cozy/sessions", { method: "GET", auth: BEARER }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });
});

describe("POST /api/cozy/sessions", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/sessions", {
        method: "POST",
        auth: null,
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR on invalid JSON", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/sessions", {
        method: "POST",
        auth: BEARER,
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 with details.personality_id when not a uuid", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/sessions", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({ personality_id: "not-a-uuid" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("personality_id");
  });

  it("returns 400 with details.title when title is too long", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/sessions", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({ title: "x".repeat(201) }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("title");
  });

  it("forwards valid body to CozyEngineV2 and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      id: "s-1",
      title: "hello",
      personality_id: PERSONALITY_ID,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    const res = await POST(
      makeReq("http://localhost/api/cozy/sessions", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({ personality_id: PERSONALITY_ID, title: "hello" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        id: "s-1",
        title: "hello",
        personality_id: PERSONALITY_ID,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    });
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      personality_id: PERSONALITY_ID,
      title: "hello",
    });
  });

  it("maps upstream 409 with PROVIDER_IN_USE code to 409 PROVIDER_IN_USE", async () => {
    installFetchMock(409, { code: "PROVIDER_IN_USE", message: "x" });
    const res = await POST(
      makeReq("http://localhost/api/cozy/sessions", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_IN_USE");
  });
});
