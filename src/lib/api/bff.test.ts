import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  errorResponse,
  unauthorizedResponse,
  validationResponse,
  errorResponseFromUpstream,
  passThroughSSE,
  parseJsonBody,
  validateBody,
} from "./bff";

describe("errorResponse", () => {
  it("builds a 401 envelope with defaults (status-mapped userMessage, retryable=false)", async () => {
    const res = errorResponse({
      code: "UNAUTHORIZED",
      message: "x",
      status: 401,
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "x",
        userMessage: "请重新登录",
        retryable: false,
      },
    });
  });

  it("defaults retryable to true for 5xx and uses status-mapped userMessage", async () => {
    const res = errorResponse({
      code: "PROVIDER_UNAVAILABLE",
      message: "y",
      status: 502,
    });
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        message: "y",
        userMessage: "服务暂时不可用，请稍后重试",
        retryable: true,
      },
    });
  });

  it("includes details when provided", async () => {
    const res = errorResponse({
      code: "VALIDATION_ERROR",
      message: "z",
      status: 400,
      details: { email: "invalid" },
    });
    const body = await res.json();
    expect(body.error.details).toEqual({ email: "invalid" });
  });

  it("omits details key entirely when not provided", async () => {
    const res = errorResponse({
      code: "UNKNOWN",
      message: "m",
      status: 500,
    });
    const body = await res.json();
    expect("details" in body.error).toBe(false);
  });
});

describe("unauthorizedResponse", () => {
  it("returns 401 UNAUTHORIZED envelope", async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.retryable).toBe(false);
  });
});

describe("validationResponse", () => {
  it("flattens zod issues into a field map and returns 400", async () => {
    const result = z.object({ email: z.string().email() }).safeParse({ email: "bad" });
    expect(result.success).toBe(false);
    if (result.success) return; // type-narrow

    const res = validationResponse(result.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("email");
  });
});

describe("errorResponseFromUpstream", () => {
  it("trusts a recognized code in the upstream body", async () => {
    const res = errorResponseFromUpstream(401, { code: "UNAUTHORIZED", message: "x" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("x");
  });

  it("trusts upstream code for non-default mappings (PERSONALITY_NOT_FOUND)", async () => {
    const res = errorResponseFromUpstream(404, {
      code: "PERSONALITY_NOT_FOUND",
      message: "deleted",
    });
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("PERSONALITY_NOT_FOUND");
    expect(body.error.message).toBe("deleted");
  });

  it("falls back to status-based code when body is null (500 → PROVIDER_UNAVAILABLE)", async () => {
    const res = errorResponseFromUpstream(500, null);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(body.error.retryable).toBe(true);
  });

  it("falls back to status-based code when body is empty (429 → RATE_LIMITED, retryable=true)", async () => {
    const res = errorResponseFromUpstream(429, {});
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.retryable).toBe(true);
  });
});

describe("passThroughSSE", () => {
  it("passes a 200 upstream body through with SSE headers", () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: hi\n\n"));
        controller.close();
      },
    });
    const upstream = new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    const res = passThroughSSE(upstream);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");
    expect(res.body).toBe(stream);
  });

  it("returns 502 PROVIDER_UNAVAILABLE when upstream is 503", async () => {
    const upstream = new Response("down", { status: 503 });
    const res = passThroughSSE(upstream);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("returns 502 when upstream.status is 503", async () => {
    const upstream = new Response("down", { status: 503 });
    const res = passThroughSSE(upstream);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("returns 502 when upstream is ok but body is null", async () => {
    // `new Response(null)` constructs a Response whose `body` is null,
    // which the helper must catch and downgrade to 502.
    const upstream = new Response(null, { status: 200 });
    const res = passThroughSSE(upstream);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });
});

describe("parseJsonBody", () => {
  it("parses valid JSON", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    const result = await parseJsonBody(req);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toEqual({ a: 1 });
  });

  it("returns a 400 VALIDATION_ERROR response on invalid JSON", async () => {
    const req = new Request("http://x", { method: "POST", body: "not json" });
    const result = await parseJsonBody(req);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    const body = await result.response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("validateBody", () => {
  const schema = z.object({ email: z.string().email() });

  it("returns 400 with details.email on invalid body", async () => {
    const result = validateBody({ email: "bad" }, schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    const body = await result.response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("email");
  });

  it("returns ok:true with parsed data on valid body", () => {
    const result = validateBody({ email: "alice@test.com" }, schema);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ email: "alice@test.com" });
  });
});
