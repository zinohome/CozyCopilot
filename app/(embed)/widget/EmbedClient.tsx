"use client";

import { useEffect, useState } from "react";
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
    <ChatWidget
      config={config}
      onClose={() => setIsOpen(false)}
      transport={transport}
    />
  ) : (
    <FloatingBubble onClick={() => setIsOpen(true)} />
  );
}
