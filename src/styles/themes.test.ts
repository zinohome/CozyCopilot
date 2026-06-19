import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  THEME_NAMES,
  MODE_NAMES,
  THEME_PRESETS,
  THEME_TOKEN_KEYS,
  DEFAULT_THEME,
  DEFAULT_MODE,
  cssVarName,
  type ThemeName,
  type ThemeMode,
} from "./themes.data";

/**
 * These tests pin two things:
 *
 *  1. The TypeScript registry (`themes.data.ts`) holds the spec'd RGB
 *     triplets for all 5 themes × 2 modes.
 *  2. The CSS files under `src/styles/themes/` and `src/styles/dark/`
 *     contain the *same* values (since CSS is the run-time truth and
 *     TypeScript is the test/embed source of truth — they must agree).
 *
 * jsdom does NOT parse `@import` or external stylesheets, so we also
 * assert that a DOM with the right `data-theme`/`data-mode` attributes
 * WOULD resolve the correct CSS variables by injecting a minimal
 * `:root[data-theme="X"] { --color-accent: ... }` rule into
 * `document.styleSheets[0]`. That proves the attribute-selector design
 * is structurally sound — the real CSS uses the same selector pattern.
 */

const STYLES_DIR = resolve(__dirname);

function readCss(relPath: string): string {
  return readFileSync(resolve(STYLES_DIR, relPath), "utf8");
}

function listThemeFiles(): { light: string[]; dark: string[] } {
  const light = readdirSync(resolve(STYLES_DIR, "themes"))
    .filter((f) => f.endsWith(".css"))
    .map((f) => `themes/${f}`)
    .sort();
  const dark = readdirSync(resolve(STYLES_DIR, "dark"))
    .filter((f) => f.endsWith(".css"))
    .map((f) => `dark/${f}`)
    .sort();
  return { light, dark };
}

function injectThemeRule(theme: ThemeName, mode: ThemeMode): void {
  const palette = THEME_PRESETS[theme][mode];
  const selector =
    mode === "dark"
      ? `:root[data-theme="${theme}"][data-mode="dark"]`
      : `:root[data-theme="${theme}"]`;
  const decls = THEME_TOKEN_KEYS.map(
    (k) => `${cssVarName(k)}: ${palette[k]};`,
  ).join(" ");
  // Find or create a writable stylesheet.
  let sheet: CSSStyleSheet | undefined;
  for (const s of Array.from(document.styleSheets)) {
    try {
      if (s.cssRules.length === 0) {
        sheet = s;
        break;
      }
    } catch {
      // Cross-origin — skip.
    }
  }
  if (!sheet) {
    const style = document.createElement("style");
    document.head.appendChild(style);
    sheet = style.sheet as CSSStyleSheet | null ?? undefined;
  }
  if (!sheet) throw new Error("no writable stylesheet available");
  sheet.insertRule(`${selector} { ${decls} }`, sheet.cssRules.length);
}

function clearInjectedRules(): void {
  for (const s of Array.from(document.styleSheets)) {
    try {
      while (s.cssRules.length > 0) s.deleteRule(0);
    } catch {
      // Cross-origin — skip.
    }
  }
}

function setHtmlAttrs(theme: string | null, mode: string | null): void {
  const html = document.documentElement;
  if (theme === null) html.removeAttribute("data-theme");
  else html.setAttribute("data-theme", theme);
  if (mode === null) html.removeAttribute("data-mode");
  else html.setAttribute("data-mode", mode);
}

describe("themes.data — registry shape", () => {
  it("declares exactly 5 theme names", () => {
    expect(THEME_NAMES).toEqual([
      "cozy-orange",
      "calm-blue",
      "mint",
      "lavender",
      "mono",
    ]);
  });

  it("declares 2 mode names", () => {
    expect(MODE_NAMES).toEqual(["light", "dark"]);
  });

  it("default theme is cozy-orange", () => {
    expect(DEFAULT_THEME).toBe("cozy-orange");
  });

  it("default mode is light", () => {
    expect(DEFAULT_MODE).toBe("light");
  });

  it("exposes 8 token keys", () => {
    expect(THEME_TOKEN_KEYS).toHaveLength(8);
  });

  it("every (theme, mode) palette has all 8 keys as RGB triplets", () => {
    for (const theme of THEME_NAMES) {
      for (const mode of MODE_NAMES) {
        const palette = THEME_PRESETS[theme][mode];
        for (const key of THEME_TOKEN_KEYS) {
          const value = palette[key];
          expect(value, `${theme}/${mode}/${key}`).toMatch(
            /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/,
          );
        }
      }
    }
  });

  it("converts camelCase keys to kebab-case CSS custom properties", () => {
    expect(cssVarName("accent")).toBe("--color-accent");
    expect(cssVarName("accentFg")).toBe("--color-accent-fg");
    expect(cssVarName("accentHover")).toBe("--color-accent-hover");
    expect(cssVarName("mutedFg")).toBe("--color-muted-fg");
  });
});

describe("themes.data — spec values", () => {
  it("cozy-orange light matches the spec", () => {
    expect(THEME_PRESETS["cozy-orange"].light).toEqual({
      bg: "250 250 249",
      fg: "28 28 28",
      muted: "245 245 244",
      mutedFg: "113 113 105",
      border: "231 229 228",
      accent: "248 123 26",
      accentFg: "255 255 255",
      accentHover: "234 110 16",
    });
  });

  it("calm-blue light matches the spec", () => {
    expect(THEME_PRESETS["calm-blue"].light.accent).toBe("59 130 246");
    expect(THEME_PRESETS["calm-blue"].light.muted).toBe("239 246 255");
    expect(THEME_PRESETS["calm-blue"].light.border).toBe("191 219 254");
  });

  it("mint light matches the spec", () => {
    expect(THEME_PRESETS["mint"].light.accent).toBe("16 185 129");
    expect(THEME_PRESETS["mint"].light.bg).toBe("247 254 250");
  });

  it("lavender light matches the spec", () => {
    expect(THEME_PRESETS["lavender"].light.accent).toBe("139 92 246");
    expect(THEME_PRESETS["lavender"].light.muted).toBe("237 233 254");
  });

  it("mono light matches the spec", () => {
    expect(THEME_PRESETS["mono"].light.accent).toBe("23 23 23");
    expect(THEME_PRESETS["mono"].light.bg).toBe("250 250 250");
  });

  it("cozy-orange dark matches the spec", () => {
    expect(THEME_PRESETS["cozy-orange"].dark.bg).toBe("23 23 23");
    expect(THEME_PRESETS["cozy-orange"].dark.accent).toBe("251 146 60");
  });

  it("calm-blue dark matches the spec", () => {
    expect(THEME_PRESETS["calm-blue"].dark.bg).toBe("15 23 42");
    expect(THEME_PRESETS["calm-blue"].dark.accent).toBe("96 165 250");
  });

  it("mint dark matches the spec", () => {
    expect(THEME_PRESETS["mint"].dark.bg).toBe("5 25 20");
    expect(THEME_PRESETS["mint"].dark.accent).toBe("52 211 153");
  });

  it("lavender dark matches the spec", () => {
    expect(THEME_PRESETS["lavender"].dark.bg).toBe("20 15 30");
    expect(THEME_PRESETS["lavender"].dark.accent).toBe("167 139 250");
  });

  it("mono dark matches the spec", () => {
    expect(THEME_PRESETS["mono"].dark.bg).toBe("23 23 23");
    expect(THEME_PRESETS["mono"].dark.accent).toBe("250 250 250");
  });
});

describe("themes.data — TypeScript and CSS agree", () => {
  const { light, dark } = listThemeFiles();

  it("there are 5 light theme CSS files", () => {
    expect(light).toHaveLength(5);
  });

  it("there are 5 dark theme CSS files", () => {
    expect(dark).toHaveLength(5);
  });

  it.each(THEME_NAMES)("themes/%s.css exists and exports 8 --color-X vars", (name) => {
    const css = readCss(`themes/${name}.css`);
    const matches = css.match(/--color-[a-z-]+:/g) ?? [];
    expect(matches).toHaveLength(8);
  });

  it.each(THEME_NAMES)("dark/%s.css exists and exports 8 --color-X vars", (name) => {
    const css = readCss(`dark/${name}.css`);
    const matches = css.match(/--color-[a-z-]+:/g) ?? [];
    expect(matches).toHaveLength(8);
  });

  it.each(THEME_NAMES)(
    "themes/%s.css declarations match themes.data light palette",
    (name) => {
      const css = readCss(`themes/${name}.css`);
      const palette = THEME_PRESETS[name].light;
      for (const key of THEME_TOKEN_KEYS) {
        const re = new RegExp(`${cssVarName(key)}:\\s*(\\d+\\s+\\d+\\s+\\d+);`);
        const match = css.match(re);
        expect(match, `${name}/${key} missing or wrong format`).toBeTruthy();
        expect(match?.[1]).toBe(palette[key]);
      }
    },
  );

  it.each(THEME_NAMES)(
    "dark/%s.css declarations match themes.data dark palette",
    (name) => {
      const css = readCss(`dark/${name}.css`);
      const palette = THEME_PRESETS[name].dark;
      for (const key of THEME_TOKEN_KEYS) {
        const re = new RegExp(`${cssVarName(key)}:\\s*(\\d+\\s+\\d+\\s+\\d+);`);
        const match = css.match(re);
        expect(match, `${name}/dark/${key} missing or wrong format`).toBeTruthy();
        expect(match?.[1]).toBe(palette[key]);
      }
    },
  );

  it.each(THEME_NAMES)(
    "themes/%s.css uses the right :root[data-theme] selector",
    (name) => {
      const css = readCss(`themes/${name}.css`);
      expect(css).toContain(`:root[data-theme="${name}"]`);
    },
  );

  it.each(THEME_NAMES)(
    "dark/%s.css uses the right :root[data-theme][data-mode] selector",
    (name) => {
      const css = readCss(`dark/${name}.css`);
      expect(css).toContain(`:root[data-theme="${name}"][data-mode="dark"]`);
    },
  );
});

describe("tokens.css — barrel + default", () => {
  const tokens = readCss("tokens.css");

  it("declares the cozy-orange default on :root (no data-theme required)", () => {
    expect(tokens).toMatch(/^:root\s*\{/m);
    expect(tokens).toContain("--color-accent: 248 123 26;");
    expect(tokens).toContain("--color-bg: 250 250 249;");
  });

  it("imports all 5 light theme files", () => {
    for (const name of THEME_NAMES) {
      expect(tokens).toContain(`@import "./themes/${name}.css"`);
    }
  });
});

describe("globals.css — dark theme imports", () => {
  const globals = readCss("../styles/globals.css");

  it("imports all 5 dark theme files", () => {
    for (const name of THEME_NAMES) {
      expect(globals).toContain(`@import "./dark/${name}.css"`);
    }
  });

  it("still wires Tailwind v4 tokens via rgb(var(--color-X))", () => {
    expect(globals).toContain("--color-accent: rgb(var(--color-accent))");
    expect(globals).toContain("--color-bg: rgb(var(--color-bg))");
  });
});

describe("CSS variable resolution — attribute-scoped overrides (jsdom)", () => {
  beforeEach(() => {
    // Wipe any leftover attributes from prior tests.
    setHtmlAttrs(null, null);
  });

  afterEach(() => {
    clearInjectedRules();
    setHtmlAttrs(null, null);
  });

  it("with no data-theme, the :root base is in scope (cozy-orange default)", () => {
    // :root matches <html> with no attributes, so we set a base rule on it.
    const palette = THEME_PRESETS[DEFAULT_THEME].light;
    const style = document.createElement("style");
    document.head.appendChild(style);
    const sheet = style.sheet;
    if (!sheet) throw new Error("no stylesheet");
    const decls = THEME_TOKEN_KEYS.map(
      (k) => `${cssVarName(k)}: ${palette[k]};`,
    ).join(" ");
    sheet.insertRule(`:root { ${decls} }`, 0);

    setHtmlAttrs(null, null);
    const accent = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-accent",
    );
    expect(accent.trim()).toBe("248 123 26");
  });

  it("with data-theme=\"calm-blue\", the calm-blue accent resolves", () => {
    injectThemeRule("calm-blue", "light");
    setHtmlAttrs("calm-blue", null);
    const accent = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-accent",
    );
    expect(accent.trim()).toBe("59 130 246");
    const bg = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-bg",
    );
    expect(bg.trim()).toBe("255 255 255");
  });

  it("with data-theme=\"calm-blue\" data-mode=\"dark\", dark calm-blue resolves", () => {
    injectThemeRule("calm-blue", "dark");
    setHtmlAttrs("calm-blue", "dark");
    const accent = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-accent",
    );
    expect(accent.trim()).toBe("96 165 250");
    const bg = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-bg",
    );
    expect(bg.trim()).toBe("15 23 42");
  });

  it("with data-theme=\"mint\" data-mode=\"dark\", dark mint resolves", () => {
    injectThemeRule("mint", "dark");
    setHtmlAttrs("mint", "dark");
    const accent = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-accent",
    );
    expect(accent.trim()).toBe("52 211 153");
    const bg = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-bg",
    );
    expect(bg.trim()).toBe("5 25 20");
  });

  it("with data-theme=\"lavender\" (no mode), lavender light resolves", () => {
    injectThemeRule("lavender", "light");
    setHtmlAttrs("lavender", null);
    const accent = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-accent",
    );
    expect(accent.trim()).toBe("139 92 246");
  });

  it("with data-theme=\"mono\" data-mode=\"dark\", mono dark resolves", () => {
    injectThemeRule("mono", "dark");
    setHtmlAttrs("mono", "dark");
    const accent = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-accent",
    );
    expect(accent.trim()).toBe("250 250 250");
    const bg = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-bg",
    );
    expect(bg.trim()).toBe("23 23 23");
  });
});
