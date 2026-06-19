"use client";

import { useMemo } from "react";
import { THEME_NAMES, type ThemeName } from "../../styles/themes.data";

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
   * Theme name. The five named values drive the built-in palettes
   * (see `src/styles/themes.data.ts`); the `(string & {})` escape
   * keeps custom themes from being rejected by TS — they round-trip
   * verbatim and the embed falls back to the default if unknown.
   *
   * Widened from 2 → 5 in M7.3.
   */
  theme: ThemeName | (string & {});
  /** Initial message to send as soon as the widget is ready. */
  prefill: string | null;
  /**
   * Hide the session list (just show the active conversation).
   *
   * In the v1 embed widget, the widget is **always** single-conversation
   * (no sidebar, no session list, no history view). The session and
   * personality are fixed by the query string and the user cannot
   * switch. This field exists for forward-compatibility — a future
   * "embed-full" variant that DOES show history will gate it on this
   * flag. The v1 widget ignores the value.
   *
   * See `.claude/M6.5-brief.md` for the rationale.
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
  const knownThemes: readonly string[] = THEME_NAMES;
  const theme: EmbedConfig["theme"] =
    themeRaw && knownThemes.includes(themeRaw)
      ? themeRaw
      : (themeRaw ?? "cozy-orange");

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
