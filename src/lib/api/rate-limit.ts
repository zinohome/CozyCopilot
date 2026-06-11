export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window after this check. */
  remaining: number;
  /** Seconds until the oldest timestamp in the window expires. Always >= 1. */
  retryAfterSec: number;
}

/**
 * In-memory sliding-window rate limiter. Pure logic — no Next.js or fetch
 * dependencies — so it can be unit tested with fake timers.
 *
 * Each `check(key)` records `now()` into the window for that key, drops
 * entries older than `windowMs`, and returns whether the request is allowed
 * along with `remaining` and `retryAfterSec` for the response headers.
 *
 * Lazy GC: stale entries are dropped per-key on every check, so a key that
 * stops being touched naturally drops to `[]` (length 0) the next time it
 * is checked after its window expires. We don't run a global sweeper.
 *
 * In-memory state is per-process, so a multi-instance deploy would need a
 * shared store (Redis) — out of scope for v1.0 (see M2 plan §1).
 */
export class RateLimiter {
  private windows = new Map<string, number[]>();

  constructor(
    private limit: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const now = this.now();
    const cutoff = now - this.windowMs;

    // Lazy GC: read or initialize the window, dropping anything expired.
    let timestamps = this.windows.get(key);
    if (timestamps) {
      timestamps = timestamps.filter((t) => t > cutoff);
    } else {
      timestamps = [];
    }

    const allowed = timestamps.length < this.limit;
    if (allowed) {
      timestamps.push(now);
    }
    this.windows.set(key, timestamps);

    // retryAfter: time until the oldest in-window timestamp ages out. With no
    // entries it is 1 (the next second), so the header is never 0/negative.
    const oldest = timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));

    return {
      allowed,
      remaining: Math.max(0, this.limit - timestamps.length),
      retryAfterSec,
    };
  }

  /** Test helper. Not used in production. */
  reset(): void {
    this.windows.clear();
  }
}
