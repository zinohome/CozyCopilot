"use client";

import { useCallback, useState } from "react";
import type { ChatStreamEvent } from "@/lib/api/chat";
import type { WSEvent } from "@/lib/api/ws";
import type { ToolCallData } from "./ToolCallViewer";

/**
 * Reducer-style hook: feed it `tool_call` / `tool_result` events from
 * either the SSE stream or the WebSocket; it maintains a `id -> ToolCallData`
 * map that React can render directly. `ingestSSE` and `ingestWS` accept the
 * full event union — non-tool events are ignored, so callers can pass
 * every event from the stream without filtering.
 *
 * State semantics:
 *  - On `tool_call` a new entry is created with `status: "running"`.
 *  - On `tool_result` the matching entry flips to `status: "completed"`
 *    and stores the result. A `tool_result` with no prior `tool_call`
 *    is dropped (idempotent — we never create "ghost" entries).
 *  - `reset()` clears the map; the caller invokes this between turns.
 *
 * The hook does not own a stream — wiring the consumer (e.g.
 * `useChatStream` / `useWSClient`) to forward events to it is the
 * caller's responsibility.
 */
export function useToolCalls() {
  const [tools, setTools] = useState<Record<string, ToolCallData>>({});

  const ingestSSE = useCallback((event: ChatStreamEvent) => {
    if (event.type === "tool_call") {
      setTools((prev) => ({
        ...prev,
        [event.id]: {
          id: event.id,
          name: event.name,
          arguments: event.arguments,
          status: "running",
        },
      }));
    } else if (event.type === "tool_result") {
      setTools((prev) => {
        const existing = prev[event.id];
        if (!existing) return prev;
        return {
          ...prev,
          [event.id]: { ...existing, result: event.result, status: "completed" },
        };
      });
    }
  }, []);

  const ingestWS = useCallback((event: WSEvent) => {
    if (event.type === "tool_call") {
      setTools((prev) => ({
        ...prev,
        [event.id]: {
          id: event.id,
          name: event.name,
          arguments: event.arguments,
          status: "running",
        },
      }));
    } else if (event.type === "tool_result") {
      setTools((prev) => {
        const existing = prev[event.id];
        if (!existing) return prev;
        return {
          ...prev,
          [event.id]: { ...existing, result: event.result, status: "completed" },
        };
      });
    }
  }, []);

  const reset = useCallback(() => setTools({}), []);

  return { tools, ingestSSE, ingestWS, reset };
}
