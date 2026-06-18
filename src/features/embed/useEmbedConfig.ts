"use client";

import { useMemo } from "react";

/**
 * M6.2: query-string configuration the host page passes to the embed
 * widget via the iframe `src` (e.g. `/widget/?key=ck_abc&personality=...`).
 * The loader (M6.3) builds this URL from the `<script data-...>` attrs
 * the host site pasted in.
 */
export interface EmbedConfig {
  /** API key (passed to `/api/cozy/auth/embed-token`, returns JWT — M6.4). */
  key: string | null;
  /** Personality UUID. */
  personality: string | null;
  /**
   * Theme name. The two named values drive the built-in palettes; the
   * `(string & {})` escape keeps custom themes from being rejected by TS
   * (they fall through to no-op styling until M6.6 wires real overrides).
   */
  theme: "cozy-orange" | "calm-blue" | (string & {});
  /** Initial message to send as soon as the widget is ready. */
  prefill: string | null;
  /**
   * Hide the session list (just show the active conversation). For M6.2
   * the embed widget never renders a sidebar regardless, but we read the
   * flag so the M6.4 transport can honor it when surfacing history APIs.
   */
  hideHistory: boolean;
  /** Parent origin for postMessage allowlist (M6.4). */
  parentOrigin: string | null;
}

export const EMPTY_EMBED_CONFIG: EmbedConfig = {
  key: null,
  personality: null,
  theme: "cozy-orange",
  prefill: null,
  hideHistory: false,
  parentOrigin: null,
};

/**
 * Treat any of "1", "true", "yes" as truthy. Conservative — anything
 * else (including empty string) is `false`.
 */
function parseBool(raw: string | null): boolean {
  if (!raw) return false;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Pure parser: takes a query string (with or without leading "?") and
 * returns the parsed `EmbedConfig`. Exported for testability — the hook
 * below is a thin wrapper that pulls the search string off `window`.
 *
 * Unknown / missing values fall back to the empty config defaults. A
 * custom `theme` value is preserved verbatim so hosts can ship their
 * own palettes without us needing to widen the union on every release.
 */
export function parseEmbedConfig(search: string | null | undefined): EmbedConfig {
  if (!search) return EMPTY_EMBED_CONFIG;
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const themeRaw = params.get("theme");
  const theme: EmbedConfig["theme"] =
    themeRaw === "cozy-orange" || themeRaw === "calm-blue" ? themeRaw : (themeRaw ?? "cozy-orange");

  return {
    key: params.get("key"),
    personality: params.get("personality"),
    theme,
    prefill: params.get("prefill"),
    hideHistory: parseBool(params.get("hideHistory")),
    parentOrigin: params.get("parentOrigin"),
  };
}

/**
 * SSR-safe parser for the embed query string. Returns the empty
 * config (with `theme: "cozy-orange"` as the default) when `window`
 * is undefined, so callers can render the widget under Next's SSR pass
 * without crashing.
 */
export function useEmbedConfig(): EmbedConfig {
  return useMemo<EmbedConfig>(() => {
    if (typeof window === "undefined") return EMPTY_EMBED_CONFIG;
    return parseEmbedConfig(window.location.search);
  }, []);
}
