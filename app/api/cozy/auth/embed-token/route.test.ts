import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Valid 32-char alphanumeric suffix (used by the happy-path tests).
const VALID_KEY = "ck_" + "abcdef0123456789ABCDEF0123456789";

describe("POST /api/cozy/auth/embed-token", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns 400 on missing body", async () => {
    const req = new Request("http://localhost/api/cozy/auth/embed-token", {
      method: "POST",
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the key does not match ck_<32 alnum>", async () => {
    const req = new Request("http://localhost/api/cozy/auth/embed-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "not-a-valid-key" }),
    });
    const res = await POST(req as unknown as NextRequest);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    // The upstream should NEVER be called for a malformed key.
    expect(originalFetch).toBe(global.fetch);
  });

  it("returns 400 when the key has the right shape but is too short", async () => {
    const req = new Request("http://localhost/api/cozy/auth/embed-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "ck_abc" }),
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("forwards to /v1/auth/embed-token and returns the user payload on upstream success", async () => {
    const spy = vi.spyOn(global, "fetch").mockImplementation(
      (async (url: RequestInfo | URL) => {
        expect(String(url)).toContain("/v1/auth/embed-token");
        return new Response(
          JSON.stringify({
            access_token: "embed-jwt",
            user_id: "u-embed-1",
            email: "embed-user@test.com",
            role: "user",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch,
    );

    const req = new Request("http://localhost/api/cozy/auth/embed-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: VALID_KEY }),
    });
    const res = await POST(req as unknown as NextRequest);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      data: {
        jwt: "embed-jwt",
        userId: "u-embed-1",
        email: "embed-user@test.com",
        role: "user",
      },
    });

    // Verify the outbound call: POST + JSON body matching the request.
    expect(spy).toHaveBeenCalledTimes(1);
    const [outUrl, outInit] = spy.mock.calls[0] as [string, RequestInit];
    expect(outUrl).toContain("/v1/auth/embed-token");
    expect(outInit.method).toBe("POST");
    expect(JSON.parse(outInit.body as string)).toEqual({ key: VALID_KEY });
  });

  it("returns 401 (UNAUTHORIZED, not retryable) when the upstream rejects the key", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      (async () =>
        new Response(JSON.stringify({ message: "invalid key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    );

    const req = new Request("http://localhost/api/cozy/auth/embed-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: VALID_KEY }),
    });
    const res = await POST(req as unknown as NextRequest);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.retryable).toBe(false);
  });

  it("returns 500 (retryable=true) when the upstream returns a non-401 error", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      (async () =>
        new Response(JSON.stringify({ message: "boom" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    );

    const req = new Request("http://localhost/api/cozy/auth/embed-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: VALID_KEY }),
    });
    const res = await POST(req as unknown as NextRequest);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error.retryable).toBe(true);
  });

  it("returns 502 (retryable=true) when the upstream fetch itself throws", async () => {
    vi.spyOn(global, "fetch").mockImplementation((async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch);

    const req = new Request("http://localhost/api/cozy/auth/embed-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: VALID_KEY }),
    });
    const res = await POST(req as unknown as NextRequest);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.error.retryable).toBe(true);
  });

  it("fills in default email/role when the upstream omits them", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      (async () =>
        new Response(
          JSON.stringify({
            access_token: "embed-jwt",
            user_id: "u-embed-2",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof fetch,
    );

    const req = new Request("http://localhost/api/cozy/auth/embed-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: VALID_KEY }),
    });
    const res = await POST(req as unknown as NextRequest);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.email).toBe("embed@cozycopilot.com");
    expect(body.data.role).toBe("user");
  });
});
