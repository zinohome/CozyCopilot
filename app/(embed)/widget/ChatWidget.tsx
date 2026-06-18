"use client";

import { Composer } from "@/features/chat/Composer";
import { MessageList } from "@/features/chat/MessageList";
import { useSessionStore } from "@/stores/session";
import type { EmbedConfig } from "@/features/embed/useEmbedConfig";

export interface ChatWidgetProps {
  /** Query-string config captured by the parent (EmbedClient). */
  config: EmbedConfig;
  /** Called when the user clicks the panel's close button. */
  onClose: () => void;
}

/**
 * M6.2: the expanded chat panel. Single-conversation UI — the embed
 * widget does NOT show a sidebar or session picker. The session and
 * personality are fixed by the URL the host page passed in; for M6.2
 * the user can still type into the composer but the network transport
 * is stubbed (the real postMessage / JWT wiring lands in M6.4).
 *
 * Layout: 380×560 fixed panel anchored bottom-right, header with a
 * close button, scrollable `<MessageList>`, sticky `<Composer>` at
 * the bottom.
 */
export function ChatWidget({ config, onClose }: ChatWidgetProps) {
  // Read the message stream from the same M4 store the main chat page
  // uses, so an existing embedded session (e.g. left open across a
  // navigation) keeps its history. The store is page-level; the embed
  // page mounts a fresh store instance per iframe.
  const messages = useSessionStore((s) => s.messages);

  // M6.2 stub: the real transport is wired in M6.4 (postMessage to the
  // host page, which talks to its own auth + chat backend). For now we
  // just log to the console so the UI is interactively testable.
  async function handleSend(_text: string): Promise<void> {
    // M6.2 stub: in production this forwards to the host via postMessage
    // (M6.4). For now we just log so the panel is interactively testable.
    console.log("[embed] send", { personality: config.personality, key: config.key });
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
          // The session/personality are not yet created in M6.2 — they
          // come from the parent in M6.4. Pass nothing so the composer
          // renders in its text-only mode (no uploads, no voice).
        />
      </div>
    </section>
  );
}
