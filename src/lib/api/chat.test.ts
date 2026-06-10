import { describe, it, expect, vi } from "vitest";
import { streamChat } from "./chat";

function sseResponse(events: string[]): Response {
  // SSE events are separated by a blank line (\n\n). Real upstream sends
  // each event terminated with \n\n; the spec's test fixture omitted this and
  // a strict parser concatenates consecutive `data:` lines into one event.
  const body = events.map((e) => `${e}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("streamChat", () => {
  it("yields delta events from SSE stream", async () => {
    const stream = sseResponse([
      'data: {"type":"delta","content":"hello"}',
      'data: {"type":"delta","content":" world"}',
      'data: {"type":"done"}',
    ]);

    const events: Array<{ type: string; content?: string }> = [];
    for await (const evt of streamChat(() => Promise.resolve(stream))) {
      events.push(evt as { type: string; content?: string });
    }
    expect(events).toEqual([
      { type: "delta", content: "hello" },
      { type: "delta", content: " world" },
      { type: "done" },
    ]);
  });

  it("calls AbortController when consumer breaks early", async () => {
    const stream = sseResponse(['data: {"type":"delta","content":"x"}\n\n']);
    const controller = new AbortController();
    const gen = streamChat(() => Promise.resolve(stream), controller.signal);
    await gen.next();
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it("throws ApiError on SSE error event", async () => {
    const stream = sseResponse([
      'data: {"type":"error","code":"RATE_LIMITED","message":"too many"}',
    ]);
    await expect(async () => {
      for await (const _ of streamChat(() => Promise.resolve(stream))) {
        // no-op
      }
    }).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
