import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EMBED_THEMES, DEFAULT_THEME, resolveTheme, applyTheme } from "./themes";
import { THEME_NAMES } from "../../styles/themes.data";
import type { EmbedTheme } from "./themes";

describe("resolveTheme", () => {
  it("returns the warm-orange palette for 'cozy-orange'", () => {
    const theme = resolveTheme("cozy-orange");
    expect(theme).toBe(EMBED_THEMES["cozy-orange"]);
    expect(theme.accent).toBe("248 123 26");
    expect(theme.accentFg).toBe("255 255 255");
  });

  it("returns the calm-blue palette for 'calm-blue'", () => {
    const theme = resolveTheme("calm-blue");
    expect(theme).toBe(EMBED_THEMES["calm-blue"]);
    expect(theme.accent).toBe("59 130 246");
    expect(theme.muted).toBe("239 246 255");
  });

  it("returns the mint palette for 'mint'", () => {
    const theme = resolveTheme("mint");
    expect(theme).toBe(EMBED_THEMES["mint"]);
    expect(theme.accent).toBe("16 185 129");
    expect(theme.muted).toBe("220 252 231");
  });

  it("returns the lavender palette for 'lavender'", () => {
    const theme = resolveTheme("lavender");
    expect(theme).toBe(EMBED_THEMES["lavender"]);
    expect(theme.accent).toBe("139 92 246");
    expect(theme.muted).toBe("237 233 254");
  });

  it("returns the mono palette for 'mono'", () => {
    const theme = resolveTheme("mono");
    expect(theme).toBe(EMBED_THEMES["mono"]);
    expect(theme.accent).toBe("23 23 23");
    expect(theme.muted).toBe("245 245 245");
  });

  it("returns the default theme for null", () => {
    expect(resolveTheme(null)).toBe(EMBED_THEMES[DEFAULT_THEME]);
  });

  it("returns the default theme for undefined", () => {
    expect(resolveTheme(undefined)).toBe(EMBED_THEMES[DEFAULT_THEME]);
  });

  it("returns the default theme and console.warns for an unknown name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const theme = resolveTheme("banana");
    expect(theme).toBe(EMBED_THEMES[DEFAULT_THEME]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("banana");
    expect(warn.mock.calls[0]?.[0]).toContain(DEFAULT_THEME);
    warn.mockRestore();
  });
});

describe("EMBED_THEMES registry", () => {
  it("has exactly 5 keys, one per theme in THEME_NAMES", () => {
    expect(Object.keys(EMBED_THEMES).sort()).toEqual([...THEME_NAMES].sort());
    expect(Object.keys(EMBED_THEMES)).toHaveLength(5);
  });

  it("every palette has the 8-key EmbedTheme shape (structural check)", () => {
    // EmbedTheme is an alias of ThemePalette — verify the structural
    // shape here so any future addition/drop of keys fails loudly.
    const requiredKeys: ReadonlyArray<keyof EmbedTheme> = [
      "bg",
      "fg",
      "muted",
      "mutedFg",
      "border",
      "accent",
      "accentFg",
      "accentHover",
    ];
    for (const name of THEME_NAMES) {
      const palette = EMBED_THEMES[name];
      for (const key of requiredKeys) {
        expect(typeof palette[key], `${name}.${key} should be a string`).toBe("string");
        expect(palette[key].length, `${name}.${key} should be a non-empty RGB triplet`).toBeGreaterThan(0);
      }
      // And the keys are exactly the 8 — no extras.
      expect(Object.keys(palette).sort()).toEqual([...requiredKeys].sort());
    }
  });
});

describe("applyTheme", () => {
  let target: HTMLElement;

  beforeEach(() => {
    target = document.createElement("div");
  });

  afterEach(() => {
    // Tear down any inline overrides between tests.
    for (const key of Object.keys(EMBED_THEMES[DEFAULT_THEME]!)) {
      const cssVar = `--color-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
      target.style.removeProperty(cssVar);
    }
  });

  it("sets the six CSS variables on the target element", () => {
    const cleanup = applyTheme(EMBED_THEMES["calm-blue"]!, target);
    expect(target.style.getPropertyValue("--color-accent")).toBe("59 130 246");
    expect(target.style.getPropertyValue("--color-accent-fg")).toBe("255 255 255");
    expect(target.style.getPropertyValue("--color-bg")).toBe("255 255 255");
    expect(target.style.getPropertyValue("--color-fg")).toBe("28 28 28");
    expect(target.style.getPropertyValue("--color-muted")).toBe("239 246 255");
    expect(target.style.getPropertyValue("--color-border")).toBe("191 219 254");
    cleanup();
  });

  it("returns a cleanup function that removes the inline overrides", () => {
    const cleanup = applyTheme(EMBED_THEMES["calm-blue"]!, target);
    expect(target.style.getPropertyValue("--color-accent")).toBe("59 130 246");
    cleanup();
    expect(target.style.getPropertyValue("--color-accent")).toBe("");
  });

  it("applies the mint palette and cleans it up", () => {
    const cleanup = applyTheme(EMBED_THEMES["mint"]!, target);
    expect(target.style.getPropertyValue("--color-accent")).toBe("16 185 129");
    expect(target.style.getPropertyValue("--color-muted")).toBe("220 252 231");
    expect(target.style.getPropertyValue("--color-accent-hover")).toBe("5 150 105");
    expect(target.style.getPropertyValue("--color-muted-fg")).toBe("22 101 52");
    cleanup();
    expect(target.style.getPropertyValue("--color-accent")).toBe("");
  });

  it("applies the lavender palette and cleans it up", () => {
    const cleanup = applyTheme(EMBED_THEMES["lavender"]!, target);
    expect(target.style.getPropertyValue("--color-accent")).toBe("139 92 246");
    expect(target.style.getPropertyValue("--color-muted")).toBe("237 233 254");
    expect(target.style.getPropertyValue("--color-accent-hover")).toBe("124 58 237");
    expect(target.style.getPropertyValue("--color-muted-fg")).toBe("91 33 182");
    cleanup();
    expect(target.style.getPropertyValue("--color-accent")).toBe("");
  });

  it("applies the mono palette and cleans it up", () => {
    const cleanup = applyTheme(EMBED_THEMES["mono"]!, target);
    expect(target.style.getPropertyValue("--color-accent")).toBe("23 23 23");
    expect(target.style.getPropertyValue("--color-muted")).toBe("245 245 245");
    expect(target.style.getPropertyValue("--color-accent-hover")).toBe("64 64 64");
    expect(target.style.getPropertyValue("--color-muted-fg")).toBe("82 82 82");
    cleanup();
    expect(target.style.getPropertyValue("--color-accent")).toBe("");
  });
});
