"use client";

import { useState } from "react";
import { ChatWidget } from "./ChatWidget";
import { FloatingBubble } from "./FloatingBubble";
import { useEmbedConfig } from "@/features/embed/useEmbedConfig";

/**
 * M6.2: top-level wiring for the embed widget. Holds the open/closed
 * state machine, swaps `<FloatingBubble>` for `<ChatWidget>` (they
 * are NEVER both mounted at the same time — mounting both would
 * double-anchor the bottom-right corner and confuse screen readers).
 *
 * Sits between the static export page and the actual UI. Renders
 * nothing on the SSR pass (`useEmbedConfig` is SSR-safe) so the
 * static export doesn't ship a flash of the bubble during hydration.
 */
export function EmbedClient() {
  const config = useEmbedConfig();
  const [isOpen, setIsOpen] = useState(false);

  return isOpen ? (
    <ChatWidget config={config} onClose={() => setIsOpen(false)} />
  ) : (
    <FloatingBubble onClick={() => setIsOpen(true)} />
  );
}
