"use client";

import { useAuthStore } from "@/stores/auth";
import { useSessionStore } from "@/stores/session";
import { streamChat } from "@/lib/api/chat";
import { ApiError } from "@/lib/api/errors";
import { Composer } from "@/features/chat/Composer";
import { MessageList } from "@/features/chat/MessageList";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export default function ChatPage() {
  const jwt = useAuthStore((s) => s.jwt);
  const router = useRouter();
  const messages = useSessionStore((s) => s.messages);
  const { appendMessage, startStreaming, appendDelta, finishStreaming, markError } =
    useSessionStore();
  const controllerRef = useRef<AbortController | null>(null);

  // Auth gate: redirect to /login if no JWT
  useEffect(() => {
    if (!jwt) router.replace("/login");
  }, [jwt, router]);

  // Cleanup: abort any in-flight stream on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  async function handleSend(text: string) {
    if (!jwt) return;

    const assistantId = crypto.randomUUID();
    appendMessage({ role: "user", content: text, status: "done" });
    startStreaming(assistantId);

    const controller = new AbortController();
    controllerRef.current = controller;

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
        if (evt.type === "delta") appendDelta(assistantId, evt.content);
        else if (evt.type === "done") finishStreaming(assistantId);
        else if (evt.type === "error") markError(assistantId, evt.code);
      }
    } catch (e) {
      // User-initiated abort (cleanup effect or browser navigation) — leave the
      // message in its current streaming state, the unmount will clear it.
      if (e instanceof ApiError && e.code === "ABORTED") return;
      markError(assistantId, "STREAM_INTERRUPTED");
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
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
