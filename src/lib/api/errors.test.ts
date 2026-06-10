import { describe, it, expect } from "vitest";
import { ApiError, ERROR_CODES, normalize, type ErrorCode } from "./errors";

describe("ERROR_CODES map", () => {
  it("contains exactly 20 entries", () => {
    expect(Object.keys(ERROR_CODES)).toHaveLength(20);
  });

  it("every entry has status, userMessage, retryable, and showToUser", () => {
    for (const [code, meta] of Object.entries(ERROR_CODES)) {
      expect(typeof meta.status, `${code}.status`).toBe("number");
      expect(typeof meta.userMessage, `${code}.userMessage`).toBe("string");
      expect(typeof meta.retryable, `${code}.retryable`).toBe("boolean");
      expect(typeof meta.showToUser, `${code}.showToUser`).toBe("boolean");
    }
  });

  it("ABORTED is the only code that hides from the user", () => {
    const hidden = (Object.keys(ERROR_CODES) as ErrorCode[]).filter(
      (c) => ERROR_CODES[c].showToUser === false,
    );
    expect(hidden).toEqual(["ABORTED"]);
  });

  it("the union length matches the map length (no missing or extra keys)", () => {
    const unionCodes: ErrorCode[] = [
      "NETWORK_OFFLINE",
      "TIMEOUT",
      "ABORTED",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "RATE_LIMITED",
      "PROVIDER_QUOTA_EXCEEDED",
      "PROVIDER_UNAVAILABLE",
      "PERSONALITY_NOT_FOUND",
      "SESSION_CLOSED",
      "VALIDATION_ERROR",
      "INSUFFICIENT_BALANCE",
      "PROVIDER_IN_USE",
      "STREAM_INTERRUPTED",
      "WS_DISCONNECTED",
      "MIC_DENIED",
      "MIC_UNSUPPORTED",
      "LIVEKIT_FAILED",
      "UNKNOWN",
    ];
    expect(unionCodes).toHaveLength(20);
    expect(Object.keys(ERROR_CODES).sort()).toEqual([...unionCodes].sort());
  });
});

describe("normalize() — status-based fallback", () => {
  it("401 maps to UNAUTHORIZED, non-retryable", () => {
    const r = normalize(401, {});
    expect(r.code).toBe("UNAUTHORIZED");
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toBe("请重新登录");
  });

  it("0 maps to NETWORK_OFFLINE, retryable", () => {
    const r = normalize(0, {});
    expect(r.code).toBe("NETWORK_OFFLINE");
    expect(r.retryable).toBe(true);
  });

  it("429 maps to RATE_LIMITED, retryable", () => {
    const r = normalize(429, {});
    expect(r.code).toBe("RATE_LIMITED");
    expect(r.retryable).toBe(true);
  });

  it("500 maps to UNKNOWN, retryable", () => {
    const r = normalize(500, {});
    expect(r.code).toBe("UNKNOWN");
    expect(r.retryable).toBe(true);
  });

  it("200 is defensive — does not crash, returns UNKNOWN envelope", () => {
    const r = normalize(200, {});
    expect(r.code).toBe("UNKNOWN");
    expect(r.retryable).toBe(true);
  });

  it("503 maps to PROVIDER_UNAVAILABLE and forwards body message", () => {
    const r = normalize(503, { message: "overloaded" });
    expect(r.code).toBe("PROVIDER_UNAVAILABLE");
    expect(r.retryable).toBe(true);
    expect(r.message).toBe("overloaded");
  });
});

describe("normalize() — body code path", () => {
  it("trusts body's known code even when status would map elsewhere", () => {
    const r = normalize(404, { code: "PERSONALITY_NOT_FOUND", message: "deleted" });
    expect(r.code).toBe("PERSONALITY_NOT_FOUND");
    expect(r.message).toBe("deleted");
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toBe("人格已删除，请重新选择");
  });

  it("falls through to status mapping when body's code is unknown", () => {
    const r = normalize(404, { code: "WEIRD_UNKNOWN_CODE" });
    expect(r.code).toBe("NOT_FOUND");
  });

  it("honors body's userMessage and retryable overrides", () => {
    const r = normalize(401, {
      code: "UNAUTHORIZED",
      userMessage: "custom Chinese text",
      retryable: true,
    });
    expect(r.code).toBe("UNAUTHORIZED");
    expect(r.userMessage).toBe("custom Chinese text");
    expect(r.retryable).toBe(true);
  });

  it("ignores non-string body code", () => {
    const r = normalize(401, { code: 42 });
    expect(r.code).toBe("UNAUTHORIZED");
  });
});

describe("ApiError backward compat", () => {
  it("constructor still accepts (code, message, retryable)", () => {
    const error = new ApiError("UNAUTHORIZED", "msg", false);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiError");
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("msg");
    expect(error.retryable).toBe(false);
  });

  it("defaults retryable to false", () => {
    const error = new ApiError("RATE_LIMITED", "slow down");
    expect(error.retryable).toBe(false);
  });
});
