"use client";

import { useState } from "react";

export type ToolCallData = {
  id: string;
  name: string;
  arguments: unknown;
  result?: unknown;
  status: "running" | "completed" | "failed";
};

/**
 * Visualises a single tool call from the SSE / WS stream. The header strip
 * always shows the tool name + a status dot; args and result are revealed
 * on click. Matches the purple-strip design spec (Tailwind: purple-50 /
 * purple-200 / purple-900).
 */
export function ToolCallViewer({ tool }: { tool: ToolCallData }) {
  const [expanded, setExpanded] = useState(false);
  const argsJson = JSON.stringify(tool.arguments, null, 2);
  const resultJson = tool.result !== undefined ? JSON.stringify(tool.result, null, 2) : null;

  return (
    <div className="my-2 overflow-hidden rounded-md border border-purple-200 bg-purple-50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-purple-900 hover:bg-purple-100"
        aria-expanded={expanded}
        data-testid={`tool-call-${tool.id}`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            tool.status === "running"
              ? "bg-purple-500 animate-pulse"
              : tool.status === "completed"
                ? "bg-green-500"
                : "bg-red-500"
          }`}
          data-testid={`tool-status-${tool.id}`}
        />
        <span className="font-mono" data-testid={`tool-name-${tool.id}`}>
          🔧 {tool.name}
        </span>
        <span className="ml-auto text-xs text-purple-700">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded && (
        <div
          className="border-t border-purple-200 bg-white px-3 py-2 text-xs"
          data-testid={`tool-body-${tool.id}`}
        >
          <div className="mb-2">
            <div className="mb-1 font-medium text-purple-900">Arguments:</div>
            <pre
              data-testid={`tool-args-${tool.id}`}
              className="overflow-x-auto rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-800"
            >
              {argsJson}
            </pre>
          </div>
          {resultJson !== null && (
            <div>
              <div className="mb-1 font-medium text-purple-900">Result:</div>
              <pre
                data-testid={`tool-result-${tool.id}`}
                className="overflow-x-auto rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-800"
              >
                {resultJson}
              </pre>
            </div>
          )}
          {tool.result === undefined && tool.status === "running" && (
            <div className="text-purple-700" data-testid={`tool-running-${tool.id}`}>
              Running…
            </div>
          )}
          {tool.status === "failed" && tool.result === undefined && (
            <div className="text-red-700" data-testid={`tool-failed-${tool.id}`}>
              Failed (no result)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
