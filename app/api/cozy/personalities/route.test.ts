import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

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

describe("GET /api/cozy/personalities", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await GET(makeReq("http://localhost/api/cozy/personalities", { auth: null }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("forwards GET to CozyEngineV2 and returns envelope on 200", async () => {
    const personalities = [
      {
        id: "p-1",
        name: "Coach",
        avatar_url: null,
        description: "supportive",
        is_builtin: true,
      },
    ];
    installFetchMock(200, { personalities });

    const res = await GET(
      makeReq("http://localhost/api/cozy/personalities", { method: "GET", auth: BEARER }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { personalities } });
  });

  it("maps upstream 401 to 401 UNAUTHORIZED", async () => {
    installFetchMock(401, { code: "UNAUTHORIZED", message: "expired" });
    const res = await GET(
      makeReq("http://localhost/api/cozy/personalities", { method: "GET", auth: BEARER }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("forwards the Authorization header verbatim to upstream", async () => {
    const mock = installFetchMock(200, { personalities: [] });
    await GET(
      makeReq("http://localhost/api/cozy/personalities", { method: "GET", auth: BEARER }),
    );
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
  });
});

describe("POST /api/cozy/personalities", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/personalities", {
        method: "POST",
        auth: null,
        body: JSON.stringify({ name: "x", system_prompt: "y" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR on invalid JSON", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/personalities", {
        method: "POST",
        auth: BEARER,
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 with details.name when name is empty", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/personalities", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({ name: "", system_prompt: "y" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("name");
  });

  it("returns 400 with details.system_prompt when system_prompt is too long", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/personalities", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({ name: "x", system_prompt: "x".repeat(8001) }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("system_prompt");
  });

  it("returns 400 with details.avatar_url when avatar_url is not a url", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/personalities", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({
          name: "x",
          system_prompt: "y",
          avatar_url: "not-a-url",
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("avatar_url");
  });

  it("forwards valid body to CozyEngineV2 and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      id: "p-1",
      name: "Coach",
      system_prompt: "be helpful",
      description: "supportive",
      avatar_url: null,
      is_builtin: false,
      created_at: "2026-01-01T00:00:00Z",
    });

    const res = await POST(
      makeReq("http://localhost/api/cozy/personalities", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({
          name: "Coach",
          system_prompt: "be helpful",
          description: "supportive",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("p-1");
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Coach",
      system_prompt: "be helpful",
      description: "supportive",
    });
  });
});
