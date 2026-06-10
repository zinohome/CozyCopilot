import { describe, it, expect, vi } from "vitest";
import { createApiClient } from "./client";

describe("createApiClient", () => {
  it("sends request with JWT in Authorization header", async () => {
    const client = createApiClient({
      baseUrl: "https://api.cozycopilot.com",
      getToken: () => "test-jwt",
    });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { foo: "bar" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await client.get("/sessions");

    expect(result).toEqual({ ok: true, data: { foo: "bar" } });
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-jwt",
    });
  });
});
