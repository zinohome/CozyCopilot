"use client";

import { useEffect, useRef, useState } from "react";
import { Composer } from "@/features/chat/Composer";
import { MessageList } from "@/features/chat/MessageList";
import { useSessionStore } from "@/stores/session";
import type { EmbedConfig } from "@/features/embed/useEmbedConfig";
import type { UseEmbedTransport } from "@/features/embed/useEmbedTransport";

export interface ChatWidgetProps {
  /** Query-string config captured by the parent (EmbedClient). */
  config: EmbedConfig;
  /** Called when the user clicks the panel's close button OR the host
   *  posts a `host:close` message. */
  onClose: () => void;
  /** M6.4: transport hook instance. The widget listens for host
   *  commands (`host:prefill`, `host:clear`, `host:set_personality`,
   *  `host:close`) and emits `cozy:session_started` on first send. */
  transport: UseEmbedTransport;
}

/**
 * M6.2 + M6.4: the expanded chat panel. Single-conversation UI — the
 * embed widget does NOT show a sidebar or session picker. The
 * session and personality are fixed by the URL the host page passed
 * in; the M6.4 transport listens for `host:set_personality` so the
 * host can swap personalities at runtime.
 *
 * Layout: 380×560 fixed panel anchored bottom-right, header with a
 * close button, scrollable `<MessageList>`, sticky `<Composer>` at
 * the bottom.
 */
export function ChatWidget({ config, onClose, transport }: ChatWidgetProps) {
  // Read the message stream from the same M4 store the main chat page
  // uses, so an existing embedded session (e.g. left open across a
  // navigation) keeps its history. The store is page-level; the embed
  // page mounts a fresh store instance per iframe.
  const messages = useSessionStore((s) => s.messages);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activePersonalityId = useSessionStore((s) => s.activePersonalityId);

  // M6.4: lift the composer's text into widget state so `host:prefill`
  // can address it. We mirror the composer's internal `text` state
  // here and pass it down as a controlled value.
  const [composerText, setComposerText] = useState<string>(config.prefill ?? "");
  const sessionStartedRef = useRef(false);

  // M6.4: register host → widget listeners. Each `on(...)` returns an
  // unsubscribe that we detach on unmount. The handlers below are the
  // small set the loader documents as the host API surface. The
  // transport's `on()` callback passes the full `CozyInboundMessage`
  // union; TypeScript can't narrow the discriminator from the generic
  // parameter alone, so each handler reconstructs the narrower shape
  // via a local type assertion.
  useEffect(() => {
    const offClose = transport.on("host:close", () => {
      onClose();
    });
    const offClear = transport.on("host:clear", () => {
      useSessionStore.getState().clear();
    });
    const offPersonality = transport.on("host:set_personality", (msg) => {
      useSessionStore
        .getState()
        .setActivePersonality((msg as { personality: string }).personality);
    });
    const offPrefill = transport.on("host:prefill", (msg) => {
      setComposerText((msg as { content: string }).content);
    });
    return () => {
      offClose();
      offClear();
      offPersonality();
      offPrefill();
    };
  }, [onClose, transport]);

  async function handleSend(text: string): Promise<void> {
    // M6.4: notify the host that a session was just kicked off. We
    // emit at most once per widget mount — repeated sends don't
    // re-fire the lifecycle event, only `cozy:tool_call` /
    // `cozy:tool_result` events do.
    if (!sessionStartedRef.current) {
      sessionStartedRef.current = true;
      transport.emit({
        type: "cozy:session_started",
        sessionId: activeSessionId ?? "embed-session",
        personalityId: activePersonalityId ?? config.personality ?? "default",
      });
    }
    // Clear the controlled composer text after a successful send.
    setComposerText("");
    // M6.4: real chat transport is wired in a later milestone. For
    // now we log so the panel is interactively testable in isolation.
    console.log("[embed] send", { personality: config.personality, key: config.key, text });
  }

  return (
    <section
      role="dialog"
      aria-label="CozyCopilot chat"
      data-testid="chat-widget"
      className="fixed bottom-4 right-4 z-50 flex h-[560px] w-[380px] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-bg text-fg shadow-[var(--shadow-pop)]"
    >
      <header className="flex items-center justify-between border-b border-border bg-bg px-4 py-3">
        <div className="flex flex-col">
          <h1 className="text-sm font-semibold">CozyCopilot</h1>
          <span className="text-xs text-muted-fg" data-testid="chat-widget-theme">
            {config.theme}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="close-chat"
          data-testid="chat-widget-close"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4" data-testid="chat-widget-scroll">
        <MessageList messages={messages} />
      </div>

      <div className="border-t border-border bg-bg p-3">
        <Composer
          onSend={handleSend}
          disabled={!config.key}
          // Controlled-mode wiring (M6.4): the widget owns the
          // composer's text so `host:prefill` can address it. Without
          // these props the composer would maintain its own internal
          // state and `host:prefill` would have no effect.
          value={composerText}
          onTextChange={setComposerText}
          // The session/personality are not yet created in M6.2 — they
          // come from the parent in M6.4. Pass nothing so the composer
          // renders in its text-only mode (no uploads, no voice).
        />
      </div>
    </section>
  );
}
