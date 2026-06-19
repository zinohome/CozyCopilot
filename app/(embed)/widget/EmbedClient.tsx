"use client";

import { useEffect, useRef, useState } from "react";
import { ChatWidget } from "./ChatWidget";
import { FloatingBubble } from "./FloatingBubble";
import { useEmbedConfig } from "@/features/embed/useEmbedConfig";
import { useEmbedTransport } from "@/features/embed/useEmbedTransport";
import { useEmbedAuth } from "@/features/embed/useEmbedAuth";
import { applyTheme, resolveTheme } from "@/features/embed/themes";

/**
 * M6.2 + M6.4: top-level wiring for the embed widget. Holds the
 * open/closed state machine, swaps `<FloatingBubble>` for
 * `<ChatWidget>` (they are NEVER both mounted at the same time —
 * mounting both would double-anchor the bottom-right corner and
 * confuse screen readers).
 *
 * M6.4 additions: the transport and auth hooks. The widget only
 * emits `cozy:ready` to the host after the BFF has exchanged the
 * embed key for a JWT — the host page uses `cozy:ready` to know
 * `window.CozyCopilot.send(...)` is safe to call.
 *
 * Sits between the static export page and the actual UI. Renders
 * nothing on the SSR pass (`useEmbedConfig` is SSR-safe) so the
 * static export doesn't ship a flash of the bubble during hydration.
 *
 * M6.5: this widget is always single-conversation. A future variant
 * that supports history should be a separate page (e.g. widget-full)
 * gated on a different query string, NOT a config flag on this widget.
 * The `config.hideHistory` field is read but ignored here.
 */
export function EmbedClient() {
  const config = useEmbedConfig();
  const [isOpen, setIsOpen] = useState(false);
  const transport = useEmbedTransport({ parentOrigin: config.parentOrigin });
  const auth = useEmbedAuth(config.key);

  // M7.5: focus management for open/close. We capture the pre-open
  // active element and restore it on close. The captured node may
  // be detached by the time we restore (e.g. the bubble unmounts
  // when the panel opens), so the restore logic falls back to
  // looking up the bubble by its data-testid if the snapshot is gone
  // or unfocusable.
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const open = () => {
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    // Defer restoration to the next tick so React has time to remount
    // the bubble. Otherwise we'd try to focus a not-yet-mounted node.
    queueMicrotask(() => {
      const snap = lastFocusedRef.current;
      // If the snapshot is still in the document, focus it. Otherwise
      // (e.g. the bubble was captured pre-open and has been remounted
      // as a fresh node), look up the bubble by data-testid — the
      // EmbedClient always knows that's the trigger.
      if (snap && document.body.contains(snap) && typeof snap.focus === "function") {
        snap.focus();
        return;
      }
      const bubble = document.querySelector<HTMLElement>(
        '[data-testid="floating-bubble"]',
      );
      bubble?.focus();
    });
  };

  // M6.4: tell the host we're ready, but only AFTER the BFF has
  // accepted the key. The host gates `window.CozyCopilot.send(...)`
  // on `cozy:ready` so a premature emit would silently drop messages.
  useEffect(() => {
    if (auth.status !== "authenticated") return;
    transport.emit({ type: "cozy:ready", version: "0.1.0" });
  }, [auth.status, transport]);

  // M6.6: apply the theme preset to the document root. We set the
  // CSS variables on `documentElement` (not a scoped element) because
  // Tailwind utility classes like `bg-accent` resolve to `var(--color-accent)`
  // at the root. Cleanup removes the inline overrides so a remount
  // starts from a clean state.
  useEffect(() => {
    return applyTheme(resolveTheme(config.theme), document.documentElement);
  }, [config.theme]);

  return isOpen ? (
    <ChatWidget config={config} onClose={close} transport={transport} />
  ) : (
    <FloatingBubble onClick={open} />
  );
}
