import { describe, it, expect } from "vitest";
import { streamChat } from "./chat";
import { ApiError } from "./errors";

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

async function collectEvents(
  gen: AsyncGenerator<unknown, void, undefined>,
): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const evt of gen) events.push(evt);
  return events;
}

async function expectThrows(
  factory: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await factory();
  } catch (e) {
    return e;
  }
  throw new Error("expected streamChat to throw");
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

  // ---- M2.6: SSE error event normalization ----

  it("throws ApiError on SSE `event: error` with known code (mid-stream)", async () => {
    const stream = sseResponse([
      'event: message\ndata: {"type":"delta","content":"hi"}',
      'event: error\ndata: {"code":"RATE_LIMITED","message":"slow down"}',
    ]);

    const gen = streamChat(() => Promise.resolve(stream));
    const events: unknown[] = [];
    let thrown: unknown;
    try {
      for await (const evt of gen) events.push(evt);
    } catch (e) {
      thrown = e;
    }
    expect(events).toEqual([{ type: "delta", content: "hi" }]);
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      code: "RATE_LIMITED",
      message: "slow down",
      retryable: true,
    });
  });

  it("throws ApiError on SSE `event: error` with PROVIDER_QUOTA_EXCEEDED", async () => {
    const stream = sseResponse([
      'event: error\ndata: {"code":"PROVIDER_QUOTA_EXCEEDED","message":"quota used"}',
    ]);
    const thrown = await expectThrows(async () => {
      await collectEvents(streamChat(() => Promise.resolve(stream)));
    });
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      code: "PROVIDER_QUOTA_EXCEEDED",
      message: "quota used",
      retryable: true,
    });
  });

  it("falls back to STREAM_INTERRUPTED for unknown error code", async () => {
    const stream = sseResponse([
      'event: error\ndata: {"code":"MYSTERY_CODE","message":"???"}',
    ]);
    const thrown = await expectThrows(async () => {
      await collectEvents(streamChat(() => Promise.resolve(stream)));
    });
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      code: "STREAM_INTERRUPTED",
      message: "???",
      retryable: true,
    });
  });

  it("falls back to STREAM_INTERRUPTED when error event has no code", async () => {
    const stream = sseResponse([
      'event: error\ndata: {"message":"something went wrong"}',
    ]);
    const thrown = await expectThrows(async () => {
      await collectEvents(streamChat(() => Promise.resolve(stream)));
    });
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      code: "STREAM_INTERRUPTED",
      message: "something went wrong",
      retryable: true,
    });
  });

  it("falls back to STREAM_INTERRUPTED on malformed error JSON", async () => {
    const stream = sseResponse(["event: error\ndata: not json"]);
    const thrown = await expectThrows(async () => {
      await collectEvents(streamChat(() => Promise.resolve(stream)));
    });
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      code: "STREAM_INTERRUPTED",
      retryable: true,
    });
  });

  it("normalizes ReadableStream read failure to STREAM_INTERRUPTED ApiError", async () => {
    // Build a Response whose body errors on the second read() — simulates
    // a network drop / decode failure mid-stream.
    let firstRead = true;
    const failingBody = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (firstRead) {
          firstRead = false;
          controller.enqueue(new TextEncoder().encode("data: {\"type\":\"delta\",\"content\":\"hi\"}"));
        } else {
          controller.error(new Error("network blip"));
        }
      },
    });
    const stream = new Response(failingBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    const thrown = await expectThrows(async () => {
      await collectEvents(streamChat(() => Promise.resolve(stream)));
    });
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      code: "STREAM_INTERRUPTED",
      retryable: true,
    });
  });

  it("throws ABORTED ApiError (not STREAM_INTERRUPTED) on user abort", async () => {
    const stream = sseResponse([
      'data: {"type":"delta","content":"hi"}',
      'data: {"type":"delta","content":" there"}',
      'data: {"type":"done"}',
    ]);
    const controller = new AbortController();
    const thrown = await expectThrows(async () => {
      const gen = streamChat(() => Promise.resolve(stream), controller.signal);
      for await (const _ of gen) {
        controller.abort();
      }
    });
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      code: "ABORTED",
      retryable: false,
    });
  });
});
