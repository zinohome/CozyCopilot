"use client";

import { useAuthStore } from "@/stores/auth";
import { useSessionStore } from "@/stores/session";
import { streamChat, type ChatStreamEvent } from "@/lib/api/chat";
import { Composer } from "@/features/chat/Composer";
import { MessageList } from "@/features/chat/MessageList";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ASSISTANT_ID = "current-assistant";

export default function ChatPage() {
  const jwt = useAuthStore((s) => s.jwt);
  const router = useRouter();
  const { messages, appendMessage, startStreaming, appendDelta, finishStreaming, markError } =
    useSessionStore();

  useEffect(() => {
    if (!jwt) router.replace("/login");
  }, [jwt, router]);

  async function handleSend(text: string) {
    if (!jwt) return;

    appendMessage({ role: "user", content: text, status: "done" });
    startStreaming(ASSISTANT_ID);

    const controller = new AbortController();

    try {
      const events = streamChat(
        () =>
          fetch("/api/cozy/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({
              // M1: hardcoded session + personality; M2 wires these properly
              session_id: "00000000-0000-0000-0000-000000000001",
              personality_id: "00000000-0000-0000-0000-000000000002",
              message: text,
            }),
            signal: controller.signal,
          }),
        controller.signal,
      );

      for await (const evt of events) {
        const e = evt as ChatStreamEvent;
        if (e.type === "delta") appendDelta(ASSISTANT_ID, e.content);
        else if (e.type === "done") finishStreaming(ASSISTANT_ID);
        else if (e.type === "error") markError(ASSISTANT_ID, e.code);
      }
    } catch (e) {
      if ((e as Error).message !== "aborted by user") {
        markError(ASSISTANT_ID, "STREAM_INTERRUPTED");
      }
    }
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="border-b border-border bg-bg px-6 py-3">
        <h1 className="text-lg font-semibold">CozyCopilot</h1>
      </header>
      <div className="flex-1 overflow-auto p-6">
        <MessageList messages={messages} />
      </div>
      <div className="border-t border-border bg-bg p-4">
        <div className="mx-auto max-w-3xl">
          <Composer onSend={handleSend} disabled={false} />
        </div>
      </div>
    </main>
  );
}
