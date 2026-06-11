import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// We re-import middleware per test so the module-level RateLimiter instances
// start with a fresh `Map<key, number[]>`. This mirrors production semantics
// closely: each test sees a clean in-memory store, just like a freshly
// restarted server.
async function loadMiddleware() {
  vi.resetModules();
  const mod = await import("./middleware");
  return mod.middleware as typeof import("./middleware").middleware;
}

function makeRequest(
  path: string,
  method: "GET" | "POST" = "GET",
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(new URL(`http://localhost${path}`), {
    method,
    headers,
  });
}

describe("middleware rate limit", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("passes through non-/api/cozy/* paths (defensive guard)", async () => {
    const middleware = await loadMiddleware();
    const res = middleware(makeRequest("/"));
    expect(res.status).toBe(200);
    // No rate-limit headers on pass-through
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
  });

  it("passes through a /api/cozy/* request under the default limit and sets X-RateLimit headers", async () => {
    const middleware = await loadMiddleware();
    const res = middleware(
      makeRequest("/api/cozy/sessions", "GET", { "x-forwarded-for": "1.1.1.1" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
  });

  it("returns 429 with RATE_LIMITED envelope on the 6th POST /api/cozy/auth from the same IP", async () => {
    const middleware = await loadMiddleware();

    // First 5 attempts pass
    for (let i = 0; i < 5; i++) {
      const res = middleware(
        makeRequest("/api/cozy/auth", "POST", { "x-forwarded-for": "2.2.2.2" }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(4 - i));
    }

    // 6th is blocked
    const blocked = middleware(
      makeRequest("/api/cozy/auth", "POST", { "x-forwarded-for": "2.2.2.2" }),
    );
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body).toEqual({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: expect.stringContaining("2.2.2.2:auth.login"),
        userMessage: "请求过于频繁，请稍后再试",
        retryable: true,
      },
    });
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect(blocked.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(blocked.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("counts different IPs independently on the login endpoint", async () => {
    const middleware = await loadMiddleware();

    // Exhaust IP A
    for (let i = 0; i < 5; i++) {
      middleware(makeRequest("/api/cozy/auth", "POST", { "x-forwarded-for": "3.3.3.3" }));
    }
    const aBlocked = middleware(
      makeRequest("/api/cozy/auth", "POST", { "x-forwarded-for": "3.3.3.3" }),
    );
    expect(aBlocked.status).toBe(429);

    // IP B is fresh
    const bRes = middleware(
      makeRequest("/api/cozy/auth", "POST", { "x-forwarded-for": "4.4.4.4" }),
    );
    expect(bRes.status).toBe(200);
    expect(bRes.headers.get("X-RateLimit-Remaining")).toBe("4");
  });

  it("login key and default key are independent buckets for the same IP", async () => {
    const middleware = await loadMiddleware();

    // Exhaust login for IP
    for (let i = 0; i < 5; i++) {
      middleware(makeRequest("/api/cozy/auth", "POST", { "x-forwarded-for": "5.5.5.5" }));
    }
    const loginBlocked = middleware(
      makeRequest("/api/cozy/auth", "POST", { "x-forwarded-for": "5.5.5.5" }),
    );
    expect(loginBlocked.status).toBe(429);

    // Default bucket for the same IP is untouched
    const defaultRes = middleware(
      makeRequest("/api/cozy/sessions", "GET", { "x-forwarded-for": "5.5.5.5" }),
    );
    expect(defaultRes.status).toBe(200);
    expect(defaultRes.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(defaultRes.headers.get("X-RateLimit-Remaining")).toBe("59");
  });

  it("falls back to x-real-ip, then 'unknown', when x-forwarded-for is missing", async () => {
    const middleware = await loadMiddleware();

    // x-real-ip
    const a = middleware(makeRequest("/api/cozy/sessions", "GET", { "x-real-ip": "6.6.6.6" }));
    expect(a.status).toBe(200);
    expect(a.headers.get("X-RateLimit-Remaining")).toBe("59");

    // No IP header — falls into the shared "unknown" bucket, separate from
    // the x-real-ip one. Two distinct keys, so the second call sees a fresh
    // bucket and remaining=59.
    const b = middleware(makeRequest("/api/cozy/sessions", "GET", {}));
    expect(b.status).toBe(200);
    expect(b.headers.get("X-RateLimit-Remaining")).toBe("59");
  });

  it("first hop of x-forwarded-for is the client IP (not the proxy chain)", async () => {
    const middleware = await loadMiddleware();
    const res = middleware(
      makeRequest("/api/cozy/sessions", "GET", {
        "x-forwarded-for": "9.9.9.9, 10.0.0.1, 10.0.0.2",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
  });
});
