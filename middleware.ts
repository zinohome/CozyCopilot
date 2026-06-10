import { NextRequest, NextResponse } from "next/server";
import { RateLimiter } from "@/lib/api/rate-limit";
import { errorResponse } from "@/lib/api/bff";

// Per-process limiters. The `Map<key, number[]>` is module-level, so it
// persists across requests within a single Node worker. A multi-instance
// deploy would need Redis (out of scope for v1.0 — see M2 plan §1).
const defaultLimit = Number(process.env.RATE_LIMIT_DEFAULT) || 60;
const loginLimit = Number(process.env.RATE_LIMIT_LOGIN) || 5;

const defaultLimiter = new RateLimiter(defaultLimit, 60_000);
const loginLimiter = new RateLimiter(loginLimit, 60_000);

function getClientIp(req: NextRequest): string {
  // Trust the first hop of x-forwarded-for (the real client), then x-real-ip,
  // and fall back to "unknown" so all unidentifiable callers share a bucket
  // rather than each getting their own key.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

function isLoginPath(pathname: string, method: string): boolean {
  return pathname === "/api/cozy/auth" && method === "POST";
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Defensive: the `config.matcher` below already gates this, but keep the
  // check so the function is safe to call from tests without going through
  // Next's matcher pipeline.
  if (!pathname.startsWith("/api/cozy/")) {
    return NextResponse.next();
  }

  const ip = getClientIp(req);
  const login = isLoginPath(pathname, req.method);
  const limiter = login ? loginLimiter : defaultLimiter;
  const limit = login ? loginLimit : defaultLimit;
  const key = `${ip}:${login ? "auth.login" : "default"}`;

  const result = limiter.check(key);
  if (!result.allowed) {
    // `errorResponse` returns a plain `Response`; NextResponse extends
    // Response, so the cast is safe (Next 15's middleware types accept
    // `Response | NextResponse`).
    const res = errorResponse({
      code: "RATE_LIMITED",
      message: `rate limit exceeded for ${key}`,
      status: 429,
      retryable: true,
    }) as unknown as NextResponse;
    res.headers.set("Retry-After", String(result.retryAfterSec));
    res.headers.set("X-RateLimit-Limit", String(limit));
    res.headers.set("X-RateLimit-Remaining", "0");
    return res;
  }

  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(limit));
  res.headers.set("X-RateLimit-Remaining", String(result.remaining));
  return res;
}

export const config = {
  // Only rate-limit /api/cozy/* — everything else (pages, /api/ws/*, etc.)
  // is unaffected.
  matcher: ["/api/cozy/:path*"],
};
