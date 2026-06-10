import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("POST /api/cozy/auth", () => {
  it("returns 400 on missing body", async () => {
    const req = new Request("http://localhost/api/cozy/auth", { method: "POST" });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("forwards login to CozyEngineV2 and returns user payload", async () => {
    const original = global.fetch;
    global.fetch = (async (url: string) => {
      expect(url).toContain("/v1/auth/login");
      return new Response(
        JSON.stringify({
          access_token: "test-jwt",
          user_id: "u-1",
          email: "alice@test.com",
          role: "user",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const req = new Request("http://localhost/api/cozy/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@test.com", password: "pw" }),
    });
    const res = await POST(req as unknown as NextRequest);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      data: {
        jwt: "test-jwt",
        userId: "u-1",
        email: "alice@test.com",
        role: "user",
      },
    });

    global.fetch = original;
  });
});
