"use client";

import { cn } from "../../lib/utils";
import type { Message } from "../../stores/session";

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="space-y-4">
      {messages.map((m) => (
        <div
          key={m.id}
          data-testid={`message-${m.role}-${m.status}`}
          className={cn(
            "rounded-[var(--radius)] px-4 py-2.5",
            m.role === "user" && "ml-auto max-w-[80%] bg-accent text-accent-fg",
            m.role === "assistant" && "mr-auto max-w-[80%] bg-muted text-fg",
            m.status === "error" && "border border-red-300",
            m.status === "superseded" && "opacity-50",
          )}
        >
          {m.content}
          {m.status === "streaming" && (
            <span
              data-testid="streaming-indicator"
              className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-accent"
            />
          )}
          {m.status === "error" && <div className="mt-2 text-xs text-red-600">⚠ 生成中断</div>}
        </div>
      ))}
    </div>
  );
}
