// Contract test: memory route group.
//
// Pins the wire format for the two BFF routes that proxy CozyMemory
// (NOT CozyEngineV2). The dual-auth pattern is the load-bearing
// detail: the BFF forwards the user's JWT for tracing, but
// authorization at CozyMemory is made via the service key in
// X-Cozy-API-Key.

import { describe, expect, it } from "vitest";
import previewFixture from "./fixtures/memory.preview.json";
import deleteFixture from "./fixtures/memory.delete.json";
import { GET as previewGet } from "@app/api/cozy/memory/preview/route";
import { DELETE as memoryDelete } from "@app/api/cozy/memory/[id]/route";
import { installFetchMock, makeReq, routeParams, useFetchMock } from "./_setup";

const BEARER = "Bearer test-jwt";
const MEMORY_ID = "mem-abc-123";

describe("contract: GET /api/cozy/memory/preview", () => {
  useFetchMock();

  it("forwards to CozyMemory /api/v1/context with dual auth (X-Cozy-API-Key + JWT) and unwraps the memory bundle", async () => {
    const mock = installFetchMock(
      previewFixture.upstreamResponse.status,
      previewFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/memory/preview", { method: "GET", auth: BEARER });
    const res = await previewGet(req);
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(previewFixture.upstreamRequest.pathname);
    expect(init.method).toBe(previewFixture.upstreamRequest.method);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(BEARER);
    // X-Cozy-API-Key is set even when the env var is empty — the BFF
    // must always send the header so the upstream can distinguish a
    // service call from an anonymous one.
    expect(headers["X-Cozy-API-Key"]).toBeDefined();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: previewFixture.expectedResponse });
  });

  it("maps upstream 500 with empty body to 500 PROVIDER_UNAVAILABLE (retryable)", async () => {
    const scenario = previewFixture.errorScenarios![0];
    const mock = installFetchMock(scenario.upstreamResponse.status, scenario.upstreamResponse.body);

    const req = makeReq("http://localhost/api/cozy/memory/preview", { method: "GET", auth: BEARER });
    const res = await previewGet(req);
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(scenario.expectedError.status);
    expect(body.error.code).toBe(scenario.expectedError.code);
    expect(body.error.retryable).toBe(scenario.expectedError.retryable);
  });
});

describe("contract: DELETE /api/cozy/memory/[id]", () => {
  useFetchMock();

  it("forwards DELETE to CozyMemory /api/v1/memories/[id] with dual auth", async () => {
    const mock = installFetchMock(
      deleteFixture.upstreamResponse.status,
      deleteFixture.upstreamResponse.body,
    );

    const req = makeReq(`http://localhost/api/cozy/memory/${MEMORY_ID}`, {
      method: "DELETE",
      auth: BEARER,
    });
    const res = await memoryDelete(req, routeParams({ id: MEMORY_ID }));
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(deleteFixture.upstreamRequest.pathname);
    expect(init.method).toBe(deleteFixture.upstreamRequest.method);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(BEARER);
    expect(headers["X-Cozy-API-Key"]).toBeDefined();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: deleteFixture.expectedResponse });
  });
});
