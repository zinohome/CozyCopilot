import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const BEARER = "Bearer test-jwt";

const validBody = {
  base_url: "https://api.openai.com",
  api_key: "sk-xxx",
  model: "gpt-4o",
};

function makeReq(body: unknown, auth: string | null = BEARER): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  return new Request("http://localhost/api/cozy/providers/test", {
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

describe("POST /api/cozy/providers/test", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization with 401 UNAUTHORIZED", async () => {
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

  it("returns 400 with details.base_url when base_url is not a url", async () => {
    const res = await POST(
      makeReq({ base_url: "bad", api_key: "k", model: "m" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("base_url");
  });

  it("returns 400 with details.api_key when api_key is empty", async () => {
    const res = await POST(
      makeReq({ base_url: "https://x", api_key: "", model: "m" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("api_key");
  });

  it("forwards ok:true upstream result as success envelope with latency passthrough", async () => {
    installFetchMock(200, { ok: true, latency_ms: 234 });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: { ok: true, latency_ms: 234 },
    });
  });

  it("forwards ok:false upstream result as 200 with structured failure (NOT a BFF error envelope)", async () => {
    installFetchMock(200, { ok: false, latency_ms: 0, error: "auth failed" });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    // The BFF envelope is still ok:true at the transport level — the test
    // endpoint reports a structured failure that the UI is expected to read
    // from `data.ok === false`. We must not surface a BFF error envelope here.
    expect(body).toEqual({
      ok: true,
      data: { ok: false, error: "auth failed", latency_ms: 0 },
    });
  });

  it("maps upstream 401 to 401 UNAUTHORIZED via errorResponseFromUpstream", async () => {
    installFetchMock(401, { code: "UNAUTHORIZED", message: "expired" });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("forwards the Authorization header verbatim to upstream", async () => {
    const mock = installFetchMock(200, { ok: true, latency_ms: 50 });
    await POST(makeReq(validBody));
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
  });
});
