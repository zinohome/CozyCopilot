"use client";

import { useAuthStore } from "@/stores/auth";
import { useSessionStore } from "@/stores/session";
import { streamChat } from "@/lib/api/chat";
import { ApiError } from "@/lib/api/errors";
import { Composer } from "@/features/chat/Composer";
import { MessageList } from "@/features/chat/MessageList";
import { ToolCallViewer } from "@/features/tools/ToolCallViewer";
import { useToolCalls } from "@/features/tools/useToolCalls";
import { PersonalitiesClient } from "@/features/personalities";
import { SessionsClient } from "@/features/sessions";
import { RealtimePanel } from "@/features/voice/RealtimePanel";
import { useRealtime } from "@/features/voice/useRealtime";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export default function ChatPage() {
  const jwt = useAuthStore((s) => s.jwt);
  const router = useRouter();
  const messages = useSessionStore((s) => s.messages);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activePersonalityId = useSessionStore((s) => s.activePersonalityId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const setActivePersonality = useSessionStore((s) => s.setActivePersonality);
  const clear = useSessionStore((s) => s.clear);
  const { appendMessage, startStreaming, appendDelta, finishStreaming, markError } =
    useSessionStore();
  const { tools, ingestSSE, reset: resetTools } = useToolCalls();
  const controllerRef = useRef<AbortController | null>(null);
  // M5.8: realtime voice-call toggle. The page owns the mount/unmount
  // decision; the panel drives the LiveKit state machine via its own
  // `useRealtime` instance. We call `hangup()` on close to ensure any
  // active room is torn down — `hangup` is a no-op when no room exists.
  const [realtimeOpen, setRealtimeOpen] = useState(false);
  const { hangup } = useRealtime();

  const handleRealtimeClose = useCallback(async () => {
    try {
      await hangup();
    } catch {
      // Hangup is best-effort on close — the panel's own instance handles
      // its own cleanup; the page's instance is a defensive guard.
    }
    setRealtimeOpen(false);
  }, [hangup]);

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

  // Reset tool-call state whenever the user switches sessions — each session
  // is a fresh turn graph.
  useEffect(() => {
    resetTools();
  }, [activeSessionId, resetTools]);

  async function handleSend(text: string) {
    if (!jwt) return;
    // M4.6: require an active session + personality. The picker enforces this
    // in normal use, but a deep link or refresh can land here without them.
    if (!activeSessionId || !activePersonalityId) {
      markError("__guard__", "VALIDATION_ERROR");
      return;
    }

    const assistantId = crypto.randomUUID();
    appendMessage({ role: "user", content: text, status: "done" });
    startStreaming(assistantId);
    resetTools();

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
              session_id: activeSessionId,
              personality_id: activePersonalityId,
              message: text,
            }),
            signal: controller.signal,
          }),
        controller.signal,
      );

      for await (const evt of events) {
        // M4.4: forward every event to the tool-call reducer (it ignores
        // non-tool events). This means tool_call / tool_result surface in
        // the UI even though the chat stream is the same SSE pipe.
        ingestSSE(evt);

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

  const hasActive = Boolean(activeSessionId && activePersonalityId);

  return (
    <main className="flex h-screen">
      {/* Sidebar: session list. Sticky left, full height. */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-bg md:block">
        <div className="flex h-full flex-col p-3">
          <h2 className="px-2 py-1 text-sm font-semibold">会话</h2>
          <SessionsClient
            activeId={activeSessionId}
            onSelect={(id) => {
              setActiveSession(id);
              clear();
            }}
          />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-bg px-6 py-3">
          <h1 className="text-lg font-semibold">CozyCopilot</h1>
          <div className="flex items-center gap-2">
            <PersonalitiesClient
              activeId={activePersonalityId}
              onChange={(id) => setActivePersonality(id)}
            />
            <button
              type="button"
              onClick={() => setRealtimeOpen((v) => !v)}
              disabled={!hasActive}
              aria-label="realtime-voice"
              aria-pressed={realtimeOpen}
              data-testid="realtime-toggle"
              className={
                realtimeOpen
                  ? "inline-flex h-10 items-center gap-2 rounded-[var(--radius)] border border-border bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
                  : "inline-flex h-10 items-center gap-2 rounded-[var(--radius)] border border-border bg-bg px-3 text-sm text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
              }
            >
              语音通话
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <MessageList messages={messages} />
          {/* M4.4: render one tool-call block per running/completed tool.
              `useToolCalls` aggregates the events fed in `handleSend`. */}
          <div className="mx-auto mt-4 max-w-3xl">
            {Object.values(tools).map((t) => (
              <ToolCallViewer key={t.id} tool={t} />
            ))}
          </div>
        </div>
        <div className="border-t border-border bg-bg p-4">
          <div className="mx-auto max-w-3xl">
            <Composer
              onSend={handleSend}
              disabled={!hasActive}
              sessionId={activeSessionId ?? undefined}
              personalityId={activePersonalityId ?? undefined}
              onUploaded={
                hasActive
                  ? (file) => {
                      // Surface the uploaded file URL as a markdown image so
                      // the next message can include it inline.
                      const text = file.mime.startsWith("image/")
                        ? `![${file.filename}](${file.url})`
                        : `[${file.filename}](${file.url})`;
                      handleSend(text);
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
      {/* M5.8: full-screen realtime voice-call overlay. Mounts only when
          the user has opened it AND has both an active session and a
          selected personality AND a valid JWT. Closing the panel calls
          `useRealtime().hangup()` defensively (no-op if no room). */}
      {realtimeOpen && activeSessionId && activePersonalityId && jwt && (
        <RealtimePanel
          sessionId={activeSessionId}
          personalityId={activePersonalityId}
          onClose={handleRealtimeClose}
          onFallbackToText={handleRealtimeClose}
        />
      )}
    </main>
  );
}
