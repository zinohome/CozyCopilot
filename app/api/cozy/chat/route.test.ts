import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

describe("POST /api/cozy/chat", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("forwards SSE chunks from CozyEngineV2", async () => {
    const sseBody = [
      'data: {"type":"delta","content":"hi"}',
      'data: {"type":"done"}',
      "",
    ].join("\n\n");

    global.fetch = (async () =>
      new Response(sseBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })) as typeof fetch;

    const req = new Request("http://localhost/api/cozy/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-jwt",
      },
      body: JSON.stringify({
        session_id: "00000000-0000-0000-0000-000000000001",
        personality_id: "00000000-0000-0000-0000-000000000002",
        message: "hi",
      }),
    });

    const res = await POST(req as any);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const text = await res.text();
    expect(text).toContain('"content":"hi"');
  });
});
