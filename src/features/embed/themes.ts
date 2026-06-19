/**
 * Theme presets for the embed widget.
 *
 * The values match the RGB-triplet format expected by `src/styles/tokens.css`
 * (Tailwind v4 `rgb(var(--color-X))` pattern). The embed widget reads from
 * the same data as the main app (`src/styles/themes.data.ts::THEME_PRESETS`)
 * so the host page and embed can never disagree on a palette.
 *
 * The v1 embed widget is light-mode only (no dark/light toggle on the
 * widget itself), so we project `THEME_PRESETS[name].light` into a flat
 * `Record<ThemeName, EmbedTheme>` map. `THEME_PRESETS` remains the
 * single source of truth; `EMBED_THEMES` is derived from it.
 *
 * Adding a new theme = adding a new entry to `THEME_PRESETS` in
 * `src/styles/themes.data.ts` (plus the matching CSS files). Custom
 * hosts can pre-set the CSS variables themselves before the embed
 * script runs; the widget only sets them when a `?theme=` is present.
 */
import {
  THEME_PRESETS,
  THEME_NAMES,
  DEFAULT_THEME as DEFAULT_THEME_NAME,
  type ThemeName,
  type ThemePalette,
} from "../../styles/themes.data";

/**
 * A flat, light-mode palette for the embed widget. Structurally
 * identical to `ThemePalette` — kept as a separate export so the
 * embed module's surface area is explicit and so the embed
 * `applyTheme` only ever sees a flat object.
 */
export type EmbedTheme = ThemePalette;

/** Default theme name. Matches the main app's warm-orange palette. */
export const DEFAULT_THEME: ThemeName = DEFAULT_THEME_NAME;

/**
 * Built-in themes, projected from `THEME_PRESETS`. Keys are the values
 * accepted in `?theme=`. The embed widget only applies the light
 * palette in v1; `THEME_PRESETS[name].light` is the same data the main
 * app's light-mode CSS resolves to.
 */
export const EMBED_THEMES: Record<ThemeName, EmbedTheme> = Object.fromEntries(
  THEME_NAMES.map((name) => [name, THEME_PRESETS[name].light]),
) as Record<ThemeName, EmbedTheme>;

/**
 * Resolve a theme name to its preset, falling back to the default.
 *
 * Unknown names get a `console.warn` so embed-host bugs are visible
 * during development. In production the warn is harmless and the
 * widget still renders correctly (with the default palette).
 */
export function resolveTheme(name: string | null | undefined): EmbedTheme {
  if (!name) return EMBED_THEMES[DEFAULT_THEME]!;
  if (name in EMBED_THEMES) return EMBED_THEMES[name as ThemeName]!;
  if (typeof console !== "undefined") {
    console.warn(`[embed] unknown theme "${name}", falling back to "${DEFAULT_THEME}"`);
  }
  return EMBED_THEMES[DEFAULT_THEME]!;
}

/**
 * Apply a theme to a given element by setting the CSS variables
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
