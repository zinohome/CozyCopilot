import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EMBED_THEMES, DEFAULT_THEME, resolveTheme, applyTheme } from "./themes";

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
});
