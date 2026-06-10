import { createParser, type ParseEvent } from "eventsource-parser";
import { ApiError } from "./errors";

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
export type ChatStreamEvent = ChatDeltaEvent | ChatDoneEvent | ChatErrorEvent;

export interface StreamChatRequest {
  sessionId: string;
  personalityId: string;
  message: string;
  model?: string;
}

export async function* streamChat(
  fetcher: () => Promise<Response>,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const res = await fetcher();
  if (!res.ok || !res.body) {
    throw new ApiError("STREAM_INTERRUPTED", `HTTP ${res.status}`);
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
      const data = JSON.parse(event.data);
      if (data.type === "error") {
        error = new ApiError(data.code ?? "UNKNOWN", data.message ?? "");
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
      if (!error) error = e instanceof Error ? new ApiError("STREAM_INTERRUPTED", e.message) : new ApiError("STREAM_INTERRUPTED", String(e));
    } finally {
      done = true;
    }
  })();

  while (!done || queue.length > 0) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new ApiError("ABORTED", "aborted by user");
    }
    if (error) throw error;
    if (queue.length > 0) {
      yield queue.shift()!;
    } else {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  if (error) throw error;
}
