import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WSClient, type WSEvent, type WSState } from "./ws";
import { ApiError } from "./errors";

/**
 * Minimal WebSocket fake. The real DOM WebSocket is unavailable in jsdom
 * (or in Node), so we substitute one that records every call and lets the
 * test synchronously fire open/message/close/error events.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;
  protocols: string | string[];
  readyState = 0; // CONNECTING
  listeners = new Map<string, Set<EventListener>>();
  sentFrames: string[] = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols ?? [];
    FakeWebSocket.instances.push(this);
    // Simulate async open — production WebSockets fire open on the next tick.
    queueMicrotask(() => {
      this.readyState = 1; // OPEN
      this.fire("open", new Event("open"));
    });
  }

  addEventListener(type: string, listener: EventListener) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string) {
    if (this.readyState !== 1) throw new Error("not open");
    this.sentFrames.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = 3; // CLOSED
    this.fire(
      "close",
      new CloseEvent("close", {
        code: code ?? 1000,
        reason: reason ?? "",
        wasClean: true,
      }),
    );
  }

  fire(type: string, ev: Event) {
    this.listeners.get(type)?.forEach((l) => l(ev));
  }

  // Test helpers
  simulateMessage(data: string) {
    this.fire("message", new MessageEvent("message", { data }));
  }

  simulateError() {
    this.fire("error", new Event("error"));
  }

  static reset() {
    FakeWebSocket.instances = [];
  }
}

async function flushMicrotasks() {
  // 3 microtask hops covers: ws ctor -> open -> promise resolution -> handler
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  FakeWebSocket.reset();
});

afterEach(() => {
  FakeWebSocket.reset();
  vi.useRealTimers();
});

describe("WSClient", () => {
  it("connect() opens with the right URL and bearer-token sub-protocol", async () => {
    const client = new WSClient({
      url: "ws://localhost/api/ws/chat",
      token: "jwt-abc",
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    });
    await client.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe("ws://localhost/api/ws/chat");
    expect(ws.protocols).toEqual(["bearer", "jwt-abc"]);
    expect(client.getState()).toBe<WSState>("open");
    client.close();
  });

  it("send() throws WS_DISCONNECTED when not open", () => {
    const client = new WSClient({
      url: "ws://localhost",
      token: "t",
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    });
    // never called connect()
    expect(() => client.send({ type: "ping", ts: 1 })).toThrow(ApiError);
    try {
      client.send({ type: "ping", ts: 1 });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("WS_DISCONNECTED");
      expect((e as ApiError).retryable).toBe(true);
    }
  });

  it("send() sends JSON-encoded frame when open", async () => {
    const client = new WSClient({
      url: "ws://localhost",
      token: "t",
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    });
    await client.connect();
    const ev: WSEvent = { type: "delta", content: "hello" };
    client.send(ev);
    const ws = FakeWebSocket.instances[0];
    expect(ws.sentFrames).toEqual([JSON.stringify(ev)]);
    client.close();
  });

  it('on("delta", handler) receives delta events', async () => {
    const client = new WSClient({
      url: "ws://localhost",
      token: "t",
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    });
    await client.connect();
    const ws = FakeWebSocket.instances[0];
    const received: WSEvent[] = [];
    client.on("delta", (e) => received.push(e));
    ws.simulateMessage(JSON.stringify({ type: "delta", content: "a" }));
    ws.simulateMessage(JSON.stringify({ type: "delta", content: "b" }));
    ws.simulateMessage(JSON.stringify({ type: "done" })); // not subscribed
    expect(received).toEqual([
      { type: "delta", content: "a" },
      { type: "delta", content: "b" },
    ]);
    client.close();
  });

  it('on("*", handler) receives every event type', async () => {
    const client = new WSClient({
      url: "ws://localhost",
      token: "t",
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    });
    await client.connect();
    const ws = FakeWebSocket.instances[0];
    const received: WSEvent[] = [];
    client.on("*", (e) => received.push(e));
    ws.simulateMessage(JSON.stringify({ type: "delta", content: "x" }));
    ws.simulateMessage(JSON.stringify({ type: "done" }));
    ws.simulateMessage(JSON.stringify({ type: "ping", ts: 42 }));
    expect(received).toEqual([
      { type: "delta", content: "x" },
      { type: "done" },
      { type: "ping", ts: 42 },
    ]);
    client.close();
  });

  it("close() sets state to 'closed' and prevents reconnect", async () => {
    const client = new WSClient({
      url: "ws://localhost",
      token: "t",
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    });
    await client.connect();
    client.close();
    expect(client.getState()).toBe<WSState>("closed");
    // Closing again should not throw / not schedule a reconnect
    client.close();
    expect(client.getState()).toBe<WSState>("closed");
  });

  it("auto-reconnects on close: 1s delay, then opens again", async () => {
    vi.useFakeTimers();
    const reconnectingSpy = vi.fn();
    const client = new WSClient({
      url: "ws://localhost",
      token: "t",
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      onReconnecting: reconnectingSpy,
    });
    await client.connect();
    // Simulate the server closing the socket.
    const firstWs = FakeWebSocket.instances[0];
    firstWs.simulateError();
    firstWs.close(1006, "abnormal");

    // The handler queues a reconnect via setTimeout(1000).
    expect(client.getState()).toBe<WSState>("reconnecting");
    expect(reconnectingSpy).toHaveBeenCalledWith(1, 1000);

    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1); // not yet
    vi.advanceTimersByTime(1);
    // After timer fires, connect() runs which ctor's a new FakeWebSocket
    // on a microtask.
    await flushMicrotasks();
    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    expect(client.getState()).toBe<WSState>("open");
    client.close();
  });

  it("exponential backoff: 2nd reconnect is 2s, 3rd is 4s", async () => {
    vi.useFakeTimers();
    const delays: number[] = [];
    const client = new WSClient({
      url: "ws://localhost",
      token: "t",
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      onReconnecting: (_attempt, delay) => delays.push(delay),
    });
    await client.connect();
    // first close -> 1s
    let ws = FakeWebSocket.instances[0];
    ws.close(1006, "abnormal");
    expect(delays).toEqual([1000]);
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();
    // second close -> 2s
    ws = FakeWebSocket.instances[1];
    ws.close(1006, "abnormal");
    expect(delays).toEqual([1000, 2000]);
    vi.advanceTimersByTime(2000);
    await flushMicrotasks();
    // third close -> 4s
    ws = FakeWebSocket.instances[2];
    ws.close(1006, "abnormal");
    expect(delays).toEqual([1000, 2000, 4000]);
    client.close();
  });

  it("max 5 attempts: 6th close does not reconnect, state becomes 'failed'", async () => {
    vi.useFakeTimers();
    const failedSpy = vi.fn();
    const client = new WSClient({
      url: "ws://localhost",
      token: "t",
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      onReconnectFailed: failedSpy,
    });
    await client.connect();
    // Force-close 5 times. After the 5th close, the 6th close (on the
    // reconnected socket) should observe attempt === 5 and bail to
    // 'failed'. Each close (except the last) schedules a reconnect
    // timer; we advance the timers between iterations to create the
    // next FakeWebSocket synchronously.
    for (let i = 0; i < 5; i++) {
      const ws = FakeWebSocket.instances[i];
      ws.close(1006, "abnormal");
      if (i < 4) {
        expect(client.getState()).toBe<WSState>("reconnecting");
        // Advance enough to clear the longest backoff (16s for i=4),
        // then flush microtasks so the new FakeWebSocket ctor + open
        // resolve synchronously.
        vi.advanceTimersByTime(20000);
        await flushMicrotasks();
        expect(client.getState()).toBe<WSState>("open");
      }
    }
    // 5th close: attempt is 4 -> increments to 5, schedules 16s timer.
    expect(client.getState()).toBe<WSState>("reconnecting");
    vi.advanceTimersByTime(20000);
    await flushMicrotasks();
    expect(client.getState()).toBe<WSState>("open");
    // 6th close: attempt is 5, NOT < 5, so state -> 'failed'.
    const sixth = FakeWebSocket.instances[5];
    sixth.close(1006, "abnormal");
    expect(client.getState()).toBe<WSState>("failed");
    expect(failedSpy).toHaveBeenCalledTimes(1);
    // No further FakeWebSocket should be created.
    const before = FakeWebSocket.instances.length;
    vi.advanceTimersByTime(20000);
    await flushMicrotasks();
    expect(FakeWebSocket.instances.length).toBe(before);
  });

  it("heartbeat: after 30s, a ping event is sent", async () => {
    vi.useFakeTimers();
    const client = new WSClient({
      url: "ws://localhost",
      token: "t",
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      pingIntervalMs: 30000,
    });
    await client.connect();
    const ws = FakeWebSocket.instances[0];
    expect(ws.sentFrames).toEqual([]);
    vi.advanceTimersByTime(30000);
    expect(ws.sentFrames).toHaveLength(1);
    const frame = JSON.parse(ws.sentFrames[0]);
    expect(frame.type).toBe("ping");
    expect(typeof frame.ts).toBe("number");
    // Second tick at 60s
    vi.advanceTimersByTime(30000);
    expect(ws.sentFrames).toHaveLength(2);
    client.close();
  });
});
