// Contract test: personalities route group.
//
// Pins the wire format for /v1/personalities against CozyEngineV2.
// Both list and create round-trip the personalities resource with no
// envelope transformation beyond wrapping the upstream body in
// `{ ok: true, data: ... }`.

import { describe, expect, it } from "vitest";
import listFixture from "./fixtures/personalities.list.json";
import createFixture from "./fixtures/personalities.create.json";
import { GET, POST } from "@app/api/cozy/personalities/route";
import { installFetchMock, makeReq, useFetchMock } from "./_setup";

const BEARER = "Bearer test-jwt";

describe("contract: GET /api/cozy/personalities", () => {
  useFetchMock();

  it("forwards GET to /v1/personalities with Bearer JWT and unwraps personalities array", async () => {
    const mock = installFetchMock(
      listFixture.upstreamResponse.status,
      listFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/personalities", { method: "GET", auth: BEARER });
    const res = await GET(req);
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(listFixture.upstreamRequest.pathname);
    expect(init.method).toBe(listFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: listFixture.expectedResponse });
  });
});

describe("contract: POST /api/cozy/personalities", () => {
  useFetchMock();

  it("forwards POST to /v1/personalities with Bearer JWT and returns the new personality", async () => {
    const mock = installFetchMock(
      createFixture.upstreamResponse.status,
      createFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/personalities", {
      method: "POST",
      contentType: "application/json",
      auth: BEARER,
      body: JSON.stringify(createFixture.upstreamRequest.body),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(createFixture.upstreamRequest.pathname);
    expect(init.method).toBe(createFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(JSON.parse(init.body as string)).toEqual(createFixture.upstreamRequest.body);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: createFixture.expectedResponse });
  });
});
