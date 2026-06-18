"use client";

import type { ReactNode } from "react";

export interface FloatingBubbleProps {
  /**
   * Called when the bubble is clicked. The parent (EmbedClient) flips
   * `isOpen` to `true` so the panel mounts in place of the bubble.
   */
  onClick: () => void;
  /**
   * Optional override for the bubble's content (emoji, image, SVG). The
   * default is the speech-bubble emoji that signals "chat".
   */
  children?: ReactNode;
  /**
   * Optional aria-label. Defaults to `"open-chat"` so screen readers
   * announce the action consistently across embed surfaces.
   */
  ariaLabel?: string;
}

/**
 * M6.2: bottom-right circular launcher. The widget is closed-state
 * by default — clicking the bubble expands the chat panel (the
 * ChatWidget replaces it in the DOM; the two are never both mounted).
 *
 * Sizing: 56px circle, accent fill, pop shadow. Anchored to the
 * bottom-right corner of the iframe viewport.
 */
export function FloatingBubble({ onClick, children, ariaLabel = "open-chat" }: FloatingBubbleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid="floating-bubble"
      className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-accent-fg shadow-[var(--shadow-pop)] transition-transform hover:scale-105 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span aria-hidden="true">{children ?? "💬"}</span>
    </button>
  );
}
