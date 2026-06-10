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

describe("GET /api/cozy/providers", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await GET(makeReq("http://localhost/api/cozy/providers", { auth: null }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("forwards GET to CozyEngineV2 and returns envelope on 200", async () => {
    const providers = [
      {
        id: "pr-1",
        label: "OpenAI",
        base_url: "https://api.openai.com",
        model: "gpt-4o",
        is_default: true,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    installFetchMock(200, { providers });

    const res = await GET(
      makeReq("http://localhost/api/cozy/providers", { method: "GET", auth: BEARER }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { providers } });
  });

  it("maps upstream 500 with empty body to 500 PROVIDER_UNAVAILABLE", async () => {
    installFetchMock(500, "");
    const res = await GET(
      makeReq("http://localhost/api/cozy/providers", { method: "GET", auth: BEARER }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("forwards the Authorization header verbatim to upstream", async () => {
    const mock = installFetchMock(200, { providers: [] });
    await GET(
      makeReq("http://localhost/api/cozy/providers", { method: "GET", auth: BEARER }),
    );
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
  });
});

describe("POST /api/cozy/providers", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/providers", {
        method: "POST",
        auth: null,
        body: JSON.stringify({ label: "x", base_url: "https://x", api_key: "k", model: "m" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR on invalid JSON", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/providers", {
        method: "POST",
        auth: BEARER,
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 with details.label when label is empty", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/providers", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({
          label: "",
          base_url: "https://x",
          api_key: "k",
          model: "m",
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("label");
  });

  it("returns 400 with details.base_url when base_url is not a url", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/providers", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({
          label: "x",
          base_url: "not-a-url",
          api_key: "k",
          model: "m",
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("base_url");
  });

  it("returns 400 with details.api_key when api_key is empty", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/providers", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({
          label: "x",
          base_url: "https://x",
          api_key: "",
          model: "m",
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("api_key");
  });

  it("returns 400 with details.model when model is too long", async () => {
    const res = await POST(
      makeReq("http://localhost/api/cozy/providers", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({
          label: "x",
          base_url: "https://x",
          api_key: "k",
          model: "x".repeat(101),
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("model");
  });

  it("forwards valid body to upstream with Authorization header and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      id: "pr-1",
      label: "OpenAI",
      base_url: "https://api.openai.com",
      model: "gpt-4o",
      is_default: false,
      created_at: "2026-01-01T00:00:00Z",
    });

    const res = await POST(
      makeReq("http://localhost/api/cozy/providers", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({
          label: "OpenAI",
          base_url: "https://api.openai.com",
          api_key: "sk-xxx",
          model: "gpt-4o",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("pr-1");
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(JSON.parse(init.body as string)).toEqual({
      label: "OpenAI",
      base_url: "https://api.openai.com",
      api_key: "sk-xxx",
      model: "gpt-4o",
    });
  });

  it("maps upstream 409 with PROVIDER_IN_USE code to 409 PROVIDER_IN_USE", async () => {
    installFetchMock(409, { code: "PROVIDER_IN_USE", message: "is_default conflict" });
    const res = await POST(
      makeReq("http://localhost/api/cozy/providers", {
        method: "POST",
        auth: BEARER,
        body: JSON.stringify({
          label: "x",
          base_url: "https://x",
          api_key: "k",
          model: "m",
          is_default: true,
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_IN_USE");
  });
});
