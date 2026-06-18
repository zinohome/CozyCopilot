import { ApiError } from "./errors";

/**
 * WebSocket event types that flow between the BFF and the client.
 * The BFF is a thin relay — the wire format is whatever CozyEngineV2 sends.
 *
 * `delta`/`done`/`error` mirror the SSE `ChatStreamEvent` surface; the
 * remaining events power tool-calling (M4.4), task lifecycle (M4.3) and
 * presence (typing indicators). `ping`/`pong` are heartbeat frames.
 */
export type WSEvent =
  | { type: "delta"; content: string }
  | { type: "done"; usage?: { promptTokens: number; completionTokens: number } }
  | { type: "error"; code: string; message: string }
  | { type: "tool_call"; id: string; name: string; arguments: unknown }
  | { type: "tool_result"; id: string; result: unknown }
  | { type: "task_started"; taskId: string }
  | { type: "task_completed"; taskId: string; result: unknown }
  | { type: "ping"; ts: number }
  | { type: "pong"; ts: number }
  | { type: "user_typing"; sessionId: string; userId: string }
  | { type: "user_stopped_typing"; sessionId: string; userId: string };

export type WSEventHandler = (event: WSEvent) => void;

export type WSClientOptions = {
  url: string;
  token: string;
  /**
   * Override the WebSocket constructor (default: `globalThis.WebSocket`).
   * Used in tests to inject a fake. Must be a class or constructor function.
   */
  WebSocketImpl?: typeof WebSocket;
  /**
   * Ping interval in ms (default 30000). Set to 0 to disable.
   */
  pingIntervalMs?: number;
  /**
   * Reconnect strategy: exponential backoff starting at 1s, doubling,
   * capped at 16s, max 5 attempts (then gives up).
   */
  onError?: (err: ApiError) => void;
  onReconnecting?: (attempt: number, delayMs: number) => void;
  onReconnectFailed?: () => void;
};

export type WSState = "idle" | "connecting" | "open" | "closed" | "reconnecting" | "failed";

/**
 * Pure-TypeScript WebSocket client. The BFF (`/api/ws/chat`) is a thin relay
 * to CozyEngineV2's `/v1/ws/chat`; this client talks to the BFF only.
 *
 * Responsibilities:
 *  - Open the socket with the JWT in the `bearer` sub-protocol
 *    (CozyEngineV2 auth convention).
 *  - Reconnect with exponential backoff (1s -> 16s, max 5 attempts) on
 *    unexpected close.
 *  - Heartbeat: send `{type:"ping"}` every 30s while open.
 *  - Decode JSON frames and dispatch by `type` to subscribers.
 *
 * Designed to be React-agnostic: the React hook lives in M4.2.
 */
export class WSClient {
  private ws: WebSocket | null = null;
  private state: WSState = "idle";
  private handlers = new Map<WSEvent["type"] | "*", Set<WSEventHandler>>();
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 5;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private explicitlyClosed = false;

  constructor(private opts: WSClientOptions) {}

  /** Current connection state (observable). */
  getState(): WSState {
    return this.state;
  }

  /**
   * Open the connection. Resolves on first `open` event.
   * Re-entrant: if already `open` or `connecting`, returns the current promise.
   */
  connect(): Promise<void> {
    if (this.state === "open" || this.state === "connecting") {
      return Promise.resolve();
    }
    this.explicitlyClosed = false;
    this.state = "connecting";
    return new Promise((resolve, reject) => {
      try {
        const Impl = this.opts.WebSocketImpl ?? globalThis.WebSocket;
        this.ws = new Impl(this.opts.url, ["bearer", this.opts.token]);
        // Note: `reconnectAttempt` is intentionally NOT reset on open.
        // The task spec describes exponential backoff (1s, 2s, 4s, 8s, 16s)
        // that persists across reconnects in a session, capped at 5 attempts.
        // A successful reconnect that drops again pays the larger delay
        // — protects against a flaky network hot-looping.
        this.ws.addEventListener("open", () => {
          this.state = "open";
          this.startPing();
          resolve();
        });
        this.ws.addEventListener("message", (ev) => this.handleMessage(ev as MessageEvent));
        this.ws.addEventListener("error", (ev) => this.handleError(ev as Event));
        this.ws.addEventListener("close", (ev) => this.handleClose(ev as CloseEvent));
      } catch (err) {
        this.state = "failed";
        reject(err);
      }
    });
  }

  /** Send a JSON-encoded event. Throws `WS_DISCONNECTED` if not connected. */
  send(event: WSEvent): void {
    if (this.state !== "open" || !this.ws) {
      throw new ApiError("WS_DISCONNECTED", "WebSocket not open", true);
    }
    this.ws.send(JSON.stringify(event));
  }

  /**
   * Subscribe to events of a given type, or "*" for all. Returns an
   * unsubscribe function — call it to remove the handler.
   */
  on(type: WSEvent["type"] | "*", handler: WSEventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }

  /**
   * Cleanly close the connection. After this call, no reconnect will be
   * attempted. Safe to call multiple times.
   */
  close(): void {
    this.explicitlyClosed = true;
    this.stopPing();
    this.ws?.close(1000, "client close");
    this.ws = null;
    this.state = "closed";
  }

  private handleMessage(ev: MessageEvent) {
    let parsed: WSEvent;
    try {
      parsed = JSON.parse(ev.data) as WSEvent;
    } catch {
      // ignore malformed frames
      return;
    }
    this.dispatch(parsed);
  }

  private dispatch(event: WSEvent) {
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const h of typeHandlers) h(event);
    }
    const wildcard = this.handlers.get("*");
    if (wildcard) {
      for (const h of wildcard) h(event);
    }
  }

  private handleError(_ev: Event) {
    const err = new ApiError("WS_DISCONNECTED", "WebSocket error", true);
    this.opts.onError?.(err);
  }

  private handleClose(_ev: CloseEvent) {
    this.stopPing();
    if (this.explicitlyClosed || this.state === "failed") {
      this.state = "closed";
      return;
    }
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      this.state = "failed";
      this.opts.onReconnectFailed?.();
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 16000);
    this.reconnectAttempt++;
    this.state = "reconnecting";
    this.opts.onReconnecting?.(this.reconnectAttempt, delay);
    setTimeout(() => {
      if (!this.explicitlyClosed) {
        void this.connect().catch(() => {
          // reconnect failure handled by handleError
        });
      }
    }, delay);
  }

  private startPing() {
    const interval = this.opts.pingIntervalMs ?? 30000;
    if (interval <= 0) return;
    this.pingTimer = setInterval(() => {
      if (this.state === "open") {
        try {
          this.send({ type: "ping", ts: Date.now() });
        } catch {
          // send throws if not open; pingTimer will be cleared on close
        }
      }
    }, interval);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
