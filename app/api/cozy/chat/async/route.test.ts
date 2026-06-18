import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const SESSION_ID = "00000000-0000-0000-0000-000000000001";
const PERSONALITY_ID = "00000000-0000-0000-0000-000000000002";
const BEARER = "Bearer test-jwt";

const validBody = {
  session_id: SESSION_ID,
  personality_id: PERSONALITY_ID,
  message: "hello",
};

function makeReq(body: unknown, auth: string | null = BEARER): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  return new Request("http://localhost/api/cozy/chat/async", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makeGetReq(taskId: string | null, auth: string | null = BEARER): NextRequest {
  const url = taskId
    ? `http://localhost/api/cozy/chat/async?taskId=${encodeURIComponent(taskId)}`
    : "http://localhost/api/cozy/chat/async";
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;
  return new Request(url, { method: "GET", headers }) as unknown as NextRequest;
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

describe("POST /api/cozy/chat/async", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization header with 401 UNAUTHORIZED", async () => {
    const res = await POST(makeReq(validBody, null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects non-Bearer Authorization header with 401 UNAUTHORIZED", async () => {
    const res = await POST(makeReq(validBody, "Basic dXNlcjpwYXNz"));
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR on invalid JSON", async () => {
    const res = await POST(makeReq("not-json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 with details.session_id when session_id is not a uuid", async () => {
    const res = await POST(
      makeReq({ session_id: "not-a-uuid", personality_id: PERSONALITY_ID, message: "hi" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("session_id");
  });

  it("returns 400 with details.message when message is empty", async () => {
    const res = await POST(
      makeReq({ session_id: SESSION_ID, personality_id: PERSONALITY_ID, message: "" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toHaveProperty("message");
  });

  it("forwards to CozyEngineV2 and returns envelope on 200", async () => {
    installFetchMock(200, { task_id: "abc", status: "pending" });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { task_id: "abc", status: "pending" } });
  });

  it("forwards the Authorization header verbatim to upstream", async () => {
    const mock = installFetchMock(200, { task_id: "abc", status: "pending" });
    await POST(makeReq(validBody));
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
  });

  it("maps upstream 401 to 401 UNAUTHORIZED via errorResponseFromUpstream", async () => {
    installFetchMock(401, { code: "UNAUTHORIZED", message: "expired" });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("maps upstream 429 to 429 RATE_LIMITED via errorResponseFromUpstream", async () => {
    installFetchMock(429, { code: "RATE_LIMITED", message: "slow down" });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("maps upstream 500 with empty body to 500 PROVIDER_UNAVAILABLE via status mapping", async () => {
    installFetchMock(500, "");

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(body.error.retryable).toBe(true);
  });

  it("trusts upstream body code for non-default mappings (PROVIDER_QUOTA_EXCEEDED)", async () => {
    installFetchMock(500, { code: "PROVIDER_QUOTA_EXCEEDED", message: "quota used" });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_QUOTA_EXCEEDED");
  });
});

describe("GET /api/cozy/chat/async", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects missing Authorization header with 401 UNAUTHORIZED", async () => {
    const res = await GET(makeGetReq("task-123", null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects non-Bearer Authorization header with 401 UNAUTHORIZED", async () => {
    const res = await GET(makeGetReq("task-123", "Basic dXNlcjpwYXNz"));
    expect(res.status).toBe(401);
  });

  it("returns 400 with explicit code when taskId query param is missing", async () => {
    const res = await GET(makeGetReq(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("MISSING_TASK_ID");
    expect(body.error.message).toMatch(/taskId/i);
  });

  it("forwards to CozyEngineV2 /v1/chat/async/:taskId and returns body on 200", async () => {
    const upstreamBody = { task_id: "task-123", status: "completed", result: "ok" };
    const mock = installFetchMock(200, upstreamBody);

    const res = await GET(makeGetReq("task-123"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(upstreamBody);

    // Verify URL was built correctly
    const callUrl = mock.mock.calls[0]?.[0] as string;
    expect(callUrl).toContain("/v1/chat/async/task-123");
  });

  it("forwards the Authorization header verbatim to upstream", async () => {
    const mock = installFetchMock(200, { status: "pending" });
    await GET(makeGetReq("task-123"));
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
  });

  it("encodes special characters in taskId", async () => {
    const mock = installFetchMock(200, { status: "pending" });
    await GET(makeGetReq("task/with/slashes"));
    const callUrl = mock.mock.calls[0]?.[0] as string;
    expect(callUrl).toContain("task%2Fwith%2Fslashes");
  });

  it("maps upstream 404 to 404 NOT_FOUND via errorResponseFromUpstream", async () => {
    installFetchMock(404, { code: "NOT_FOUND", message: "task expired" });

    const res = await GET(makeGetReq("task-123"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("maps upstream 502 to 502 PROVIDER_UNAVAILABLE via status mapping", async () => {
    installFetchMock(502, "");

    const res = await GET(makeGetReq("task-123"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });
});
