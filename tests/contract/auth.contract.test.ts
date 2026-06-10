// Contract test: POST /api/cozy/auth
//
// Pins the wire format for the login route against CozyEngineV2's
// /v1/auth/login endpoint. The BFF unwraps the upstream's
// `access_token` / `user_id` / `email` / `role` fields into a
// `data: { jwt, userId, email, role }` shape, and never forwards
// `token_type` or `expires_at` to the client.

import { describe, expect, it } from "vitest";
import fixture from "./fixtures/auth.login.json";
import { POST } from "@app/api/cozy/auth/route";
import { installFetchMock, makeReq, useFetchMock } from "./_setup";

describe("contract: POST /api/cozy/auth", () => {
  useFetchMock();

  it("forwards login to /v1/auth/login and unwraps access_token into jwt", async () => {
    const mock = installFetchMock(fixture.upstreamResponse.status, fixture.upstreamResponse.body);

    const req = makeReq("http://localhost/api/cozy/auth", {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify(fixture.upstreamRequest.body),
    });
    const res = await POST(req);
    const body = await res.json();

    // Outbound assertions
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(fixture.upstreamRequest.pathname);
    expect(init.method).toBe(fixture.upstreamRequest.method);
    expect(JSON.parse(init.body as string)).toEqual(fixture.upstreamRequest.body);
    // Auth route is special: it does NOT forward a Bearer token to upstream
    // because the user has none yet — they are *getting* one.
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();

    // Inbound assertions: the BFF envelope wraps the unwrapped data
    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      data: fixture.expectedResponse,
    });
  });
});
