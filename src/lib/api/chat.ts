import { createParser, type ParseEvent } from "eventsource-parser";
import { ApiError, ERROR_CODES, type ErrorCode } from "./errors";

export interface ChatDeltaEvent {
  type: "delta";
  content: string;
}
export interface ChatDoneEvent {
  type: "done";
  usage?: { promptTokens: number; completionTokens: number };
}
export interface ChatErrorEvent {
  type: "error";
  code: string;
  message: string;
}
export interface ChatToolCallEvent {
  type: "tool_call";
  id: string;
  name: string;
  arguments: unknown;
}
export interface ChatToolResultEvent {
  type: "tool_result";
  id: string;
  result: unknown;
}
export type ChatStreamEvent =
  | ChatDeltaEvent
  | ChatDoneEvent
  | ChatErrorEvent
  | ChatToolCallEvent
  | ChatToolResultEvent;

export interface StreamChatRequest {
  sessionId: string;
  personalityId: string;
  message: string;
  model?: string;
}

/**
 * Build a normalized ApiError from a `code` + `message` pair. The `code` is
 * looked up in `ERROR_CODES` to decide retryability; unknown / missing codes
 * fall back to `STREAM_INTERRUPTED` (retryable), which is the safe default
 * for any mid-stream failure the server didn't classify.
 */
function normalizeStreamError(code: unknown, message: unknown): ApiError {
  if (typeof code === "string" && code in ERROR_CODES) {
    const meta = ERROR_CODES[code as ErrorCode];
    return new ApiError(
      code as ErrorCode,
      typeof message === "string" ? message : "stream error",
      meta.retryable,
    );
  }
  return new ApiError(
    "STREAM_INTERRUPTED",
    typeof message === "string" ? message : "stream error",
    true,
  );
}

export async function* streamChat(
  fetcher: () => Promise<Response>,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const res = await fetcher();
  if (!res.ok || !res.body) {
    throw new ApiError("STREAM_INTERRUPTED", `HTTP ${res.status}`, true);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const queue: ChatStreamEvent[] = [];
  let done = false;
  let error: ApiError | null = null;

  const parser = createParser((event: ParseEvent) => {
    // Only handle regular events; ignore reconnect-interval pings.
    if (event.type !== "event") return;
    try {
      // SSE-level `event: error\ndata: {code, message}` (M2.6 protocol).
      // Takes precedence over payload-level `type: error` so a future
      // migration to event-typed errors doesn't need a dual format.
      if (event.event === "error") {
        let payload: { code?: unknown; message?: unknown } = {};
        try {
          payload = JSON.parse(event.data);
        } catch {
          error = new ApiError("STREAM_INTERRUPTED", "invalid error payload", true);
          done = true;
          return;
        }
        error = normalizeStreamError(payload.code, payload.message);
        done = true;
        return;
      }

      const data = JSON.parse(event.data);
      if (data.type === "error") {
        error = normalizeStreamError(data.code, data.message);
        done = true;
        return;
      }
      queue.push(data as ChatStreamEvent);
    } catch {
      // malformed event: skip
    }
  });

  // Background reader loop
  (async () => {
    try {
      while (!done) {
        const { value, done: rDone } = await reader.read();
        if (rDone) break;
        const chunk = decoder.decode(value, { stream: true });
        parser.feed(chunk);
        if (signal?.aborted) break;
      }
    } catch (e) {
      // Reader failures (network drop, decode failure, etc.) are never
      // AbortError and never an ApiError from upstream — normalize to a
      // retryable STREAM_INTERRUPTED so the UI can offer retry.
      if (!error)
        error =
          e instanceof Error
            ? new ApiError("STREAM_INTERRUPTED", e.message, true)
            : new ApiError("STREAM_INTERRUPTED", String(e), true);
    } finally {
      done = true;
    }
  })();

  while (!done || queue.length > 0) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new ApiError("ABORTED", "aborted by user", false);
    }
    // Drain queued events before reporting the terminal error, so any
    // delta that arrived in the same chunk as `event: error` is still
    // yielded to the consumer.
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    if (error) throw error;
    await new Promise((r) => setTimeout(r, 10));
  }
  if (error) throw error;
}
