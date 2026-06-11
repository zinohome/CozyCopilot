import { describe, it, expect } from "vitest";
import { GET, runtime } from "./route";

describe("WS /api/ws/chat", () => {
  it("exports runtime = nodejs (required for WebSocket support)", () => {
    expect(runtime).toBe("nodejs");
  });

  it("rejects missing ?token query param with 401 UNAUTHORIZED", async () => {
    const req = new Request("http://localhost/api/ws/chat");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects empty ?token= with 401 UNAUTHORIZED", async () => {
    const req = new Request("http://localhost/api/ws/chat?token=");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 503 WS_DISCONNECTED when WebSocketPair is unavailable (jsdom env)", async () => {
    // jsdom does not provide WebSocketPair; production Next.js Node runtime does
    const req = new Request("http://localhost/api/ws/chat?token=test-jwt");
    const res = await GET(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("WS_DISCONNECTED");
    expect(body.error.retryable).toBe(true);
  });
});
