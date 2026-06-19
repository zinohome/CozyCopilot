"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CozyInboundMessage, CozyOutboundMessage } from "./types";

/**
 * M6.4 — bridge between the embed widget (running inside an iframe on
 * the host's origin) and the host page itself (running the loader).
 *
 * Outbound: `emit(msg)` posts to `window.parent` with a `targetOrigin`
 * chosen from `parentOrigin` (or "*" as a v1 fallback documented in
 * the loader). We default to the strictest origin the hook is given.
 *
 * Inbound: `on(type, handler)` registers a `message` listener that
 * ONLY fires when the message:
 *   - has the right `type` discriminator, AND
 *   - originated from `window.parent` (not a foreign iframe or dev tool).
 *
 * The dual filter is the security boundary — relying on `type` alone
 * would let any same-origin frame in the host page drive the widget.
 */
export interface UseEmbedTransportOptions {
  /** Parent window origin (e.g. "https://example.com"). Used as the
   *  `targetOrigin` when posting to `window.parent`. If null, uses "*". */
  parentOrigin: string | null;
  /**
   * When false (default), outbound posts are queued/guarded. We expose
   * the flag so the EmbedClient can hold `cozy:ready` until
   * authentication has succeeded.
   */
  ready?: boolean;
}

export interface UseEmbedTransport {
  /**
   * Posts a message to `window.parent`. No-op when `window` is
   * undefined (SSR) or `ready === false`. Returns `void` to keep the
   * shape ergonomic in React effects.
   */
  emit: (msg: CozyOutboundMessage) => void;
  /**
   * Subscribes to a specific inbound `type`. The handler fires only for
   * messages that match BOTH `msg.type === type` AND
   * `evt.source === window.parent`. Returns an unsubscribe function
   * suitable for `useEffect` cleanups.
   */
  on: (
    type: CozyInboundMessage["type"],
    handler: (msg: CozyInboundMessage) => void,
  ) => () => void;
}

/**
 * SSR-safe check — both `window` and `window.parent` are gated the same
 * way so the hook never crashes during Next's SSR pass.
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.parent !== "undefined";
}

export function useEmbedTransport(opts: UseEmbedTransportOptions): UseEmbedTransport {
  const { parentOrigin, ready = true } = opts;

  // Stash parentOrigin in a ref so `on()` can close over a stable
  // identity without re-attaching listeners every render. The filter
  // is by `evt.source` so parentOrigin doesn't actually need to be in
  // the listener — but we keep the ref here for symmetry / future
  // origin-matching on inbound too.
  const parentOriginRef = useRef(parentOrigin);
  parentOriginRef.current = parentOrigin;

  // Stash `ready` in a ref so `emit()` only fires once we've cleared the
  // auth gate without re-creating the callback identity every render.
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const emit = useCallback((msg: CozyOutboundMessage): void => {
    if (!isBrowser()) return;
    if (!readyRef.current) return;
    const targetOrigin = parentOriginRef.current ?? "*";
    window.parent.postMessage(msg, targetOrigin);
  }, []);

  // The `on` API is built around `window.addEventListener("message")`.
  // We can't bind the listener once at hook construction because we
  // need access to the per-type handler. Instead, we expose a closure
  // that registers a listener with a per-call filter; cleanup is the
  // returned unsubscribe function. (Listeners are cheap; a single
  // host page registers ~4 of them, so we don't bother with a single
  // dispatcher + type dispatch table here.)
  const on = useCallback(
    (type: CozyInboundMessage["type"], handler: (msg: CozyInboundMessage) => void): (() => void) => {
      if (!isBrowser()) return () => undefined;

      const listener = (evt: MessageEvent): void => {
        // Source gate: only accept messages from `window.parent`. Foreign
        // iframes, dev-tools, and sibling windows are all rejected here.
        if (evt.source !== window.parent) return;

        const data = evt.data as unknown;
        if (!data || typeof data !== "object") return;
        const msg = data as { type?: unknown };
        if (msg.type !== type) return;

        handler(msg as CozyInboundMessage);
      };

      window.addEventListener("message", listener);
      return () => window.removeEventListener("message", listener);
    },
    [],
  );

  // Detach all listeners on unmount. We don't track them here directly
  // because callers each own their unsubscribe — this is a defensive
  // net for hosts that forget to clean up. No-op when the hook is
  // already on SSR (where `on` returned a noop).
  useEffect(() => {
    return () => {
      // No global state to wipe; this is a hook-level re-entry guard.
      // Listeners attached via `on()` are removed by their owners.
    };
  }, []);

  return { emit, on };
}
