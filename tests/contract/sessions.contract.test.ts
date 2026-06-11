// Contract test: sessions route group.
//
// Pins the wire format for /v1/sessions and /v1/sessions/[id] against
// CozyEngineV2. The DELETE route also asserts the 404 NOT_FOUND error
// path because the unit tests rely on the same fixture and we want
// the wire-format error envelope pinned too.

import { describe, expect, it } from "vitest";
import listFixture from "./fixtures/sessions.list.json";
import createFixture from "./fixtures/sessions.create.json";
import getFixture from "./fixtures/sessions.get.json";
import patchFixture from "./fixtures/sessions.patch.json";
import deleteFixture from "./fixtures/sessions.delete.json";
import { GET as listGet, POST as listPost } from "@app/api/cozy/sessions/route";
import { DELETE as idDelete, GET as idGet, PATCH as idPatch } from "@app/api/cozy/sessions/[id]/route";
import { installFetchMock, makeReq, routeParams, useFetchMock } from "./_setup";

const BEARER = "Bearer test-jwt";
const SESSION_ID = "11111111-1111-4111-8111-111111111101";

describe("contract: GET /api/cozy/sessions", () => {
  useFetchMock();

  it("forwards GET to /v1/sessions with Bearer JWT and unwraps sessions array", async () => {
    const mock = installFetchMock(
      listFixture.upstreamResponse.status,
      listFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/sessions", { method: "GET", auth: BEARER });
    const res = await listGet(req);
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    // Pin both URL and method to the fixture so BFF drift AND fixture
    // drift both fail this test. (listFixture's pathname is the source
    // of truth for what the BFF is required to call.)
    expect(String(url)).toContain(listFixture.upstreamRequest.pathname);
    expect(init.method).toBe(listFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: listFixture.expectedResponse });
  });
});

describe("contract: POST /api/cozy/sessions", () => {
  useFetchMock();

  it("forwards POST to /v1/sessions with Bearer JWT and returns the new session", async () => {
    const mock = installFetchMock(
      createFixture.upstreamResponse.status,
      createFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/sessions", {
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

describe("contract: GET /api/cozy/sessions/[id]", () => {
  useFetchMock();

  it("forwards GET to /v1/sessions/[id] with Bearer JWT", async () => {
    const mock = installFetchMock(
      getFixture.upstreamResponse.status,
      getFixture.upstreamResponse.body,
    );

    const req = makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
      method: "GET",
      auth: BEARER,
    });
    const res = await idGet(req, routeParams({ id: SESSION_ID }));
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

describe("contract: PATCH /api/cozy/sessions/[id]", () => {
  useFetchMock();

  it("forwards PATCH to /v1/sessions/[id] with Bearer JWT and partial body", async () => {
    const mock = installFetchMock(
      patchFixture.upstreamResponse.status,
      patchFixture.upstreamResponse.body,
    );

    const req = makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
      method: "PATCH",
      contentType: "application/json",
      auth: BEARER,
      body: JSON.stringify(patchFixture.upstreamRequest.body),
    });
    const res = await idPatch(req, routeParams({ id: SESSION_ID }));
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

describe("contract: DELETE /api/cozy/sessions/[id]", () => {
  useFetchMock();

  it("forwards DELETE to /v1/sessions/[id] with Bearer JWT and returns deleted envelope", async () => {
    const mock = installFetchMock(
      deleteFixture.upstreamResponse.status,
      deleteFixture.upstreamResponse.body,
    );

    const req = makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
      method: "DELETE",
      auth: BEARER,
    });
    const res = await idDelete(req, routeParams({ id: SESSION_ID }));
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(deleteFixture.upstreamRequest.pathname);
    expect(init.method).toBe(deleteFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: deleteFixture.expectedResponse });
  });

  it("maps upstream 404 NOT_FOUND to a 404 error envelope", async () => {
    const scenario = deleteFixture.errorScenarios![0];
    const mock = installFetchMock(scenario.upstreamResponse.status, scenario.upstreamResponse.body);

    const req = makeReq(`http://localhost/api/cozy/sessions/${SESSION_ID}`, {
      method: "DELETE",
      auth: BEARER,
    });
    const res = await idDelete(req, routeParams({ id: SESSION_ID }));
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(scenario.expectedError.status);
    expect(body.error.code).toBe(scenario.expectedError.code);
  });
});
