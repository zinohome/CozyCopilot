// Contract test: providers route group.
//
// Pins the wire format for the four BFF provider routes against
// CozyEngineV2's /v1/users/me/providers[/...] surface.
//
// Special cases:
//   * providers/test upstream returns 200 with `{ ok: false, ... }` —
//     the BFF MUST NOT promote that to an error envelope; the UI is
//     expected to read `data.ok` itself. This is the load-bearing
//     contract here.
//   * providers/delete maps upstream 409 PROVIDER_IN_USE to the same
//     code on the BFF side, surfacing the upstream message verbatim.

import { describe, expect, it } from "vitest";
import listFixture from "./fixtures/providers.list.json";
import createFixture from "./fixtures/providers.create.json";
import getFixture from "./fixtures/providers.get.json";
import patchFixture from "./fixtures/providers.patch.json";
import deleteFixture from "./fixtures/providers.delete.json";
import testFixture from "./fixtures/providers.test.json";
import { GET as listGet, POST as listPost } from "@app/api/cozy/providers/route";
import { DELETE as idDelete, GET as idGet, PATCH as idPatch } from "@app/api/cozy/providers/[id]/route";
import { POST as testPost } from "@app/api/cozy/providers/test/route";
import { installFetchMock, makeReq, routeParams, useFetchMock } from "./_setup";

const BEARER = "Bearer test-jwt";
const PROVIDER_ID = "66666666-6666-4666-8666-666666666601";

describe("contract: GET /api/cozy/providers", () => {
  useFetchMock();

  it("forwards GET to /v1/users/me/providers with Bearer JWT", async () => {
    const mock = installFetchMock(
      listFixture.upstreamResponse.status,
      listFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/providers", { method: "GET", auth: BEARER });
    const res = await listGet(req);
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(listFixture.upstreamRequest.pathname);
    expect(String(url)).not.toContain(PROVIDER_ID);
    expect(init.method).toBe(listFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: listFixture.expectedResponse });
  });
});

describe("contract: POST /api/cozy/providers", () => {
  useFetchMock();

  it("forwards POST to /v1/users/me/providers with Bearer JWT and full body", async () => {
    const mock = installFetchMock(
      createFixture.upstreamResponse.status,
      createFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/providers", {
      method: "POST",
      contentType: "application/json",
      auth: BEARER,
      body: JSON.stringify(createFixture.upstreamRequest.body),
    });
    const res = await listPost(req);
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

describe("contract: GET /api/cozy/providers/[id]", () => {
  useFetchMock();

  it("forwards GET to /v1/users/me/providers/[id] with Bearer JWT", async () => {
    const mock = installFetchMock(
      getFixture.upstreamResponse.status,
      getFixture.upstreamResponse.body,
    );

    const req = makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
      method: "GET",
      auth: BEARER,
    });
    const res = await idGet(req, routeParams({ id: PROVIDER_ID }));
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(getFixture.upstreamRequest.pathname);
    expect(init.method).toBe(getFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: getFixture.expectedResponse });
  });
});

describe("contract: PATCH /api/cozy/providers/[id]", () => {
  useFetchMock();

  it("forwards PATCH to /v1/users/me/providers/[id] with Bearer JWT and partial body", async () => {
    const mock = installFetchMock(
      patchFixture.upstreamResponse.status,
      patchFixture.upstreamResponse.body,
    );

    const req = makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
      method: "PATCH",
      contentType: "application/json",
      auth: BEARER,
      body: JSON.stringify(patchFixture.upstreamRequest.body),
    });
    const res = await idPatch(req, routeParams({ id: PROVIDER_ID }));
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(patchFixture.upstreamRequest.pathname);
    expect(init.method).toBe(patchFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(JSON.parse(init.body as string)).toEqual(patchFixture.upstreamRequest.body);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: patchFixture.expectedResponse });
  });
});

describe("contract: DELETE /api/cozy/providers/[id]", () => {
  useFetchMock();

  it("forwards DELETE to /v1/users/me/providers/[id] with Bearer JWT and returns deleted envelope", async () => {
    const mock = installFetchMock(
      deleteFixture.upstreamResponse.status,
      deleteFixture.upstreamResponse.body,
    );

    const req = makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
      method: "DELETE",
      auth: BEARER,
    });
    const res = await idDelete(req, routeParams({ id: PROVIDER_ID }));
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(deleteFixture.upstreamRequest.pathname);
    expect(init.method).toBe(deleteFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: deleteFixture.expectedResponse });
  });

  it("maps upstream 409 PROVIDER_IN_USE to a 409 error envelope", async () => {
    const scenario = deleteFixture.errorScenarios![0];
    const mock = installFetchMock(scenario.upstreamResponse.status, scenario.upstreamResponse.body);

    const req = makeReq(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
      method: "DELETE",
      auth: BEARER,
    });
    const res = await idDelete(req, routeParams({ id: PROVIDER_ID }));
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(scenario.expectedError.status);
    expect(body.error.code).toBe(scenario.expectedError.code);
  });
});

describe("contract: POST /api/cozy/providers/test (structured failure case)", () => {
  useFetchMock();

  it("forwards ok:false upstream result as 200 with structured failure (NOT a BFF error envelope)", async () => {
    const mock = installFetchMock(
      testFixture.upstreamResponse.status,
      testFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/providers/test", {
      method: "POST",
      contentType: "application/json",
      auth: BEARER,
      body: JSON.stringify(testFixture.upstreamRequest.body),
    });
    const res = await testPost(req);
    const body = await res.json();

    // Outbound assertions
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(testFixture.upstreamRequest.pathname);
    expect(init.method).toBe(testFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(JSON.parse(init.body as string)).toEqual(testFixture.upstreamRequest.body);

    // Inbound assertions: even when upstream says ok:false, the BFF
    // transport-level envelope MUST be { ok: true, data: { ok: false, ... } }
    // because the UI is responsible for reading the structured result.
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: testFixture.expectedResponse });
  });
});
