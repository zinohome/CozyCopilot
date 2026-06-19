/**
 * Theme presets for the embed widget.
 *
 * The values match the RGB-triplet format expected by `src/styles/tokens.css`
 * (Tailwind v4 `rgb(var(--color-X))` pattern). A preset overrides the same
 * six CSS variables that `tokens.css` defines for the main app, so every
 * Tailwind utility class on the embed (e.g. `bg-accent`, `text-fg`,
 * `border-border`) automatically picks up the active preset.
 *
 * Adding a new theme = adding a new entry to `EMBED_THEMES`. Custom hosts
 * can pre-set the CSS variables themselves before the embed script runs;
 * the widget only sets them when a `?theme=` is present.
 */
export interface EmbedTheme {
  /** `--color-accent` — primary brand color. */
  accent: string;
  /** `--color-accent-fg` — text on accent. */
  accentFg: string;
  /** `--color-bg` — page/panel background. */
  bg: string;
  /** `--color-fg` — primary text. */
  fg: string;
  /** `--color-muted` — secondary background (assistant bubbles, hover). */
  muted: string;
  /** `--color-border` — borders. */
  border: string;
}

/**
 * Built-in themes. The keys are the values accepted in `?theme=`.
 * Keep this list in sync with `useEmbedConfig.EmbedConfig.theme`.
 */
export const EMBED_THEMES: Record<string, EmbedTheme> = {
  "cozy-orange": {
    // Default — matches tokens.css :root exactly.
    accent: "248 123 26",       // #F87B1A
    accentFg: "255 255 255",
    bg: "250 250 249",
    fg: "28 28 28",
    muted: "245 245 244",
    border: "231 229 228",
  },
  "calm-blue": {
    accent: "59 130 246",       // #3B82F6
    accentFg: "255 255 255",
    bg: "255 255 255",
    fg: "28 28 28",
    muted: "239 246 255",       // blue-50
    border: "191 219 254",      // blue-200
  },
};

/**
 * Default theme name. Matches the main app's warm-orange palette.
 */
export const DEFAULT_THEME = "cozy-orange";

/**
 * Resolve a theme name to its preset, falling back to the default.
 *
 * Unknown names get a `console.warn` so embed-host bugs are visible
 * during development. In production the warn is harmless and the
 * widget still renders correctly (with the default palette).
 */
export function resolveTheme(name: string | null | undefined): EmbedTheme {
  if (!name) return EMBED_THEMES[DEFAULT_THEME]!;
  if (name in EMBED_THEMES) return EMBED_THEMES[name]!;
  if (typeof console !== "undefined") {
    console.warn(`[embed] unknown theme "${name}", falling back to "${DEFAULT_THEME}"`);
  }
  return EMBED_THEMES[DEFAULT_THEME]!;
}

/**
 * Apply a theme to a given element by setting the six CSS variables
 * it overrides. Returns a cleanup function that removes the inline
 * overrides — useful so the page's normal theme reasserts itself
 * when the embed unmounts (e.g. during dev hot-reload).
 *
 * Exported for testability; the production path calls this from
 * `EmbedClient`.
 */
export function applyTheme(theme: EmbedTheme, target: HTMLElement): () => void {
  const cssVars: string[] = [];
  for (const [key, value] of Object.entries(theme)) {
    // CSS custom property names use kebab-case; our keys are camelCase.
    const cssVar = `--color-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
    target.style.setProperty(cssVar, value);
    cssVars.push(cssVar);
  }
  return () => {
    for (const cssVar of cssVars) {
      target.style.removeProperty(cssVar);
    }
  };
}
