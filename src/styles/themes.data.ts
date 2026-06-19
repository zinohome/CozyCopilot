/**
 * Theme presets — TypeScript source of truth.
 *
 * The CSS files under `src/styles/themes/` and `src/styles/dark/` are the
 * run-time truth (Tailwind v4 reads `--color-X` from CSS custom properties).
 * This module mirrors those RGB triplets in TypeScript so:
 *
 *   1. `src/styles/themes.test.ts` can assert the right values are
 *      produced for each (theme, mode) combination without depending on
 *      a real CSS engine (jsdom does not parse CSS).
 *   2. `src/features/embed/themes.ts` (refactored in M7.3) can share
 *      the same data instead of duplicating it.
 *   3. Future theme additions are a one-file TypeScript change with the
 *      CSS hand-written from the same spec.
 *
 * Keep this file in sync with:
 *   - src/styles/themes/{name}.css   (light)
 *   - src/styles/dark/{name}.css     (dark)
 *
 * RGB triplet format (space-separated, e.g. `"248 123 26"`) matches the
 * `rgb(var(--color-accent))` consumption pattern in `globals.css`.
 */

export const THEME_NAMES = [
  "cozy-orange",
  "calm-blue",
  "mint",
  "lavender",
  "mono",
] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

/** Default theme. Matches the no-`data-theme` :root declaration in tokens.css. */
export const DEFAULT_THEME: ThemeName = "cozy-orange";

export const MODE_NAMES = ["light", "dark"] as const;
export type ThemeMode = (typeof MODE_NAMES)[number];

export const DEFAULT_MODE: ThemeMode = "light";

/** One mode's worth of a theme — six CSS custom properties + their resolved names. */
export interface ThemePalette {
  bg: string;
  fg: string;
  muted: string;
  mutedFg: string;
  border: string;
  accent: string;
  accentFg: string;
  accentHover: string;
}

/** All 8 tokens in display order, used by tests to count `--color-X` per file. */
export const THEME_TOKEN_KEYS = [
  "bg",
  "fg",
  "muted",
  "mutedFg",
  "border",
  "accent",
  "accentFg",
  "accentHover",
] as const satisfies readonly (keyof ThemePalette)[];

/** Convert a camelCase key to its CSS custom property name. */
export function cssVarName(key: keyof ThemePalette): string {
  return `--color-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
}

/** All 5 themes × 2 modes = 10 palettes. */
export const THEME_PRESETS: Record<ThemeName, Record<ThemeMode, ThemePalette>> = {
  "cozy-orange": {
    light: {
      bg: "250 250 249",
      fg: "28 28 28",
      muted: "245 245 244",
      mutedFg: "113 113 105",
      border: "231 229 228",
      accent: "248 123 26",
      accentFg: "255 255 255",
      accentHover: "234 110 16",
    },
    dark: {
      bg: "23 23 23",
      fg: "245 245 244",
      muted: "38 38 38",
      mutedFg: "163 163 152",
      border: "64 64 64",
      accent: "251 146 60",
      accentFg: "23 23 23",
      accentHover: "253 158 82",
    },
  },
  "calm-blue": {
    light: {
      bg: "255 255 255",
      fg: "28 28 28",
      muted: "239 246 255",
      mutedFg: "59 130 246",
      border: "191 219 254",
      accent: "59 130 246",
      accentFg: "255 255 255",
      accentHover: "37 99 235",
    },
    dark: {
      bg: "15 23 42",
      fg: "248 250 252",
      muted: "30 41 59",
      mutedFg: "148 163 184",
      border: "51 65 85",
      accent: "96 165 250",
      accentFg: "15 23 42",
      accentHover: "59 130 246",
    },
  },
  mint: {
    light: {
      bg: "247 254 250",
      fg: "20 40 30",
      muted: "220 252 231",
      mutedFg: "22 101 52",
      border: "187 247 208",
      accent: "16 185 129",
      accentFg: "255 255 255",
      accentHover: "5 150 105",
    },
    dark: {
      bg: "5 25 20",
      fg: "220 252 231",
      muted: "6 78 59",
      mutedFg: "134 239 172",
      border: "6 95 70",
      accent: "52 211 153",
      accentFg: "5 25 20",
      accentHover: "16 185 129",
    },
  },
  lavender: {
    light: {
      bg: "252 250 255",
      fg: "40 30 50",
      muted: "237 233 254",
      mutedFg: "91 33 182",
      border: "221 214 254",
      accent: "139 92 246",
      accentFg: "255 255 255",
      accentHover: "124 58 237",
    },
    dark: {
      bg: "20 15 30",
      fg: "237 233 254",
      muted: "46 16 101",
      mutedFg: "196 181 253",
      border: "76 29 149",
      accent: "167 139 250",
      accentFg: "20 15 30",
      accentHover: "139 92 246",
    },
  },
  mono: {
    light: {
      bg: "250 250 250",
      fg: "23 23 23",
      muted: "245 245 245",
      mutedFg: "82 82 82",
      border: "229 229 229",
      accent: "23 23 23",
      accentFg: "255 255 255",
      accentHover: "64 64 64",
    },
    dark: {
      bg: "23 23 23",
      fg: "250 250 250",
      muted: "38 38 38",
      mutedFg: "163 163 163",
      border: "64 64 64",
      accent: "250 250 250",
      accentFg: "23 23 23",
      accentHover: "212 212 212",
    },
  },
};

/** Resolve a name to a palette, falling back to the default theme/mode. */
export function resolveThemePalette(
  theme: string | null | undefined,
  mode: string | null | undefined = "light",
): { theme: ThemeName; mode: ThemeMode; palette: ThemePalette } {
  const safeTheme: ThemeName = (THEME_NAMES as readonly string[]).includes(theme ?? "")
    ? (theme as ThemeName)
    : DEFAULT_THEME;
  const safeMode: ThemeMode = mode === "dark" ? "dark" : "light";
  return { theme: safeTheme, mode: safeMode, palette: THEME_PRESETS[safeTheme][safeMode] };
}
