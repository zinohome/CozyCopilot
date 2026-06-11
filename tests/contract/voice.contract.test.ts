// Contract test: /api/cozy/voice/token (separate from chat/voice-token).
//
// Both /api/cozy/chat/voice-token and /api/cozy/voice/token proxy the
// same upstream /v1/voice/token — but they are distinct BFF routes and
// are tested against distinct fixtures. This test pins the second
// route's wire format.

import { describe, expect, it } from "vitest";
import fixture from "./fixtures/voice.token.json";
import { POST } from "@app/api/cozy/voice/token/route";
import { installFetchMock, makeReq, useFetchMock } from "./_setup";

const BEARER = "Bearer test-jwt";

describe("contract: POST /api/cozy/voice/token", () => {
  useFetchMock();

  it("forwards to /v1/voice/token with Bearer JWT and returns LiveKit token envelope", async () => {
    const mock = installFetchMock(
      fixture.upstreamResponse.status,
      fixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/voice/token", {
      method: "POST",
      contentType: "application/json",
      auth: BEARER,
      body: JSON.stringify(fixture.upstreamRequest.body),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(fixture.upstreamRequest.pathname);
    expect(init.method).toBe(fixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(JSON.parse(init.body as string)).toEqual(fixture.upstreamRequest.body);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: fixture.expectedResponse });
  });
});
