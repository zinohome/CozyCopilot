import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  let now: number;
  let nowFn: () => number;

  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    nowFn = () => now;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first N calls and blocks the (N+1)th with retryAfterSec >= 1", () => {
    const limiter = new RateLimiter(3, 1000, nowFn);

    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 2, retryAfterSec: 1 });
    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 1, retryAfterSec: 1 });
    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 0, retryAfterSec: 1 });
    expect(limiter.check("a")).toEqual({ allowed: false, remaining: 0, retryAfterSec: 1 });
  });

  it("counts different keys independently", () => {
    const limiter = new RateLimiter(2, 1000, nowFn);

    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 1, retryAfterSec: 1 });
    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 0, retryAfterSec: 1 });
    expect(limiter.check("a")).toEqual({ allowed: false, remaining: 0, retryAfterSec: 1 });

    // "b" is unaffected by "a"'s exhaustion
    expect(limiter.check("b")).toEqual({ allowed: true, remaining: 1, retryAfterSec: 1 });
    expect(limiter.check("b")).toEqual({ allowed: true, remaining: 0, retryAfterSec: 1 });
    expect(limiter.check("b")).toEqual({ allowed: false, remaining: 0, retryAfterSec: 1 });
  });

  it("lets a key call again once its window has fully expired", () => {
    const limiter = new RateLimiter(2, 1000, nowFn);

    expect(limiter.check("a")).toMatchObject({ allowed: true });
    expect(limiter.check("a")).toMatchObject({ allowed: true });
    expect(limiter.check("a")).toMatchObject({ allowed: false });

    now = 1100;
    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 1, retryAfterSec: 1 });
  });

  it("uses a sliding window — entries just inside the window block the next call", () => {
    const limiter = new RateLimiter(2, 1000, nowFn);

    limiter.check("a"); // t=0
    now = 500;
    limiter.check("a"); // t=500
    now = 900;
    expect(limiter.check("a")).toEqual({ allowed: false, remaining: 0, retryAfterSec: 1 });

    // t=1001 — the t=0 entry has now expired, freeing one slot
    now = 1001;
    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 0, retryAfterSec: 1 });

    // t=1501 — the t=500 entry expires, t=900 still inside, one more allowed
    now = 1501;
    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 0, retryAfterSec: 1 });
  });

  it("does not push a timestamp when the request is denied (denied calls do not extend the window)", () => {
    const limiter = new RateLimiter(1, 1000, nowFn);

    expect(limiter.check("a")).toMatchObject({ allowed: true }); // t=0 recorded
    now = 100;
    expect(limiter.check("a")).toMatchObject({ allowed: false }); // t=100 NOT recorded
    now = 200;
    expect(limiter.check("a")).toMatchObject({ allowed: false }); // t=200 NOT recorded

    // Original t=0 still drives the window. Window is [0, 1000]; at t=1000 it expires.
    now = 1001;
    expect(limiter.check("a")).toMatchObject({ allowed: true });
  });

  it("reset() clears all state across keys", () => {
    const limiter = new RateLimiter(1, 1000, nowFn);

    expect(limiter.check("a")).toMatchObject({ allowed: true });
    expect(limiter.check("b")).toMatchObject({ allowed: true });
    expect(limiter.check("a")).toMatchObject({ allowed: false });
    expect(limiter.check("b")).toMatchObject({ allowed: false });

    limiter.reset();

    // After reset, both keys are fresh
    expect(limiter.check("a")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("b")).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("lazy GC drops expired entries on each check (a long-idle key has empty state)", () => {
    const limiter = new RateLimiter(5, 60_000, nowFn);

    // 100 distinct keys touched at t=0 — each gets one entry in its window.
    for (let i = 0; i < 100; i++) {
      expect(limiter.check(`k${i}`)).toMatchObject({ allowed: true, remaining: 4 });
    }

    // The map now has 100 entries, all with a single stale [t=0] timestamp.
    // Lazy GC is per-key on access — no global sweep.

    // 61s later, each key's only entry is at t=0, and the cutoff is t=1001.
    // The next check on each key should filter the stale entry out, push a
    // fresh timestamp, and return remaining=4 (5 - 1 = 4).
    now = 60_001;
    for (let i = 0; i < 100; i++) {
      const result = limiter.check(`k${i}`);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    }
  });
});
