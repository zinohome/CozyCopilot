// M7.6 — Theme end-to-end integration test.
//
// Proves the full theme swap wiring works in a single jsdom pass:
//
//   user → useThemeStore (zustand + persist) → RootThemeBridge (useEffect)
//       → applyThemeToDom → <html data-theme="..." data-mode="...">
//       → getComputedStyle resolves the right --color-accent
//
// The last step is the regression net for the CSS/data registry — it
// fails if `src/styles/themes/{name}.css` and `src/styles/dark/{name}.css`
// drift from `src/styles/themes.data.ts`.
//
// jsdom does NOT parse external stylesheets, so the integration test
// injects the CSS rules it needs directly via `sheet.insertRule(...)`,
// the same trick used by `src/styles/themes.test.ts`.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, act, cleanup } from "@testing-library/react";
import { RootThemeBridge } from "../../src/components/theme/RootThemeBridge";
import { useThemeStore, type ThemeName, type ThemeMode } from "../../src/stores/theme";
import {
  THEME_NAMES,
  MODE_NAMES,
  THEME_PRESETS,
  THEME_TOKEN_KEYS,
  cssVarName,
} from "../../src/styles/themes.data";

const STYLES_DIR = resolve(__dirname, "../../src/styles");

/**
 * Read the raw CSS for a (theme, mode) pair from disk. Returns the
 * verbatim file contents — the test injects the whole thing into a
 * stylesheet rather than re-deriving values from `THEME_PRESETS`.
 * This is what catches a typo in the CSS file.
 */
function readThemeCss(theme: ThemeName, mode: ThemeMode): string {
  const rel = mode === "light"
    ? `themes/${theme}.css`
    : `dark/${theme}.css`;
  return readFileSync(resolve(STYLES_DIR, rel), "utf-8");
}

/**
 * Find or create a writable stylesheet on the document and append the
 * given CSS rule text. jsdom treats `<style>.sheet.insertRule` like a
 * real browser, so `getComputedStyle` then resolves `var(...)` against
 * the injected declarations.
 */
function appendCss(css: string): void {
  let sheet: CSSStyleSheet | undefined;
  for (const s of Array.from(document.styleSheets)) {
    try {
      // An empty (or non-cross-origin) sheet is safe to write to.
      sheet = s;
      break;
    } catch {
      // Cross-origin sheet — skip.
    }
  }
  if (!sheet) {
    const style = document.createElement("style");
    document.head.appendChild(style);
    sheet = style.sheet as CSSStyleSheet | null ?? undefined;
  }
  if (!sheet) throw new Error("no writable stylesheet available");
  sheet.insertRule(css, sheet.cssRules.length);
}

/** Inject the full set of CSS rules for one (theme, mode) palette. */
function injectPalette(theme: ThemeName, mode: ThemeMode): void {
  appendCss(readThemeCss(theme, mode));
}

/** Strip any data-* attributes off <html>. */
function clearHtmlAttrs(): void {
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  html.removeAttribute("data-mode");
}

/** Remove every <style> element this test appended to <head>.
 *
 * Important: when vitest runs multiple test files in one worker (e.g.
 * `pnpm test path/to/a.test.tsx path/to/b.test.tsx`), the jsdom
 * environment is shared across files and our injected <style> elements
 * would otherwise pollute the next file's DOM. */
function clearInjectedStyles(): void {
  for (const s of Array.from(document.head.querySelectorAll("style"))) {
    s.remove();
  }
}

/**
 * Reset the persisted state, in-memory store, and DOM between tests so
 * the integration test is hermetic. `useThemeStore.setState` is the
 * safe way to zero out the in-memory slice — bypassing the store with
 * `localStorage.clear()` alone won't reset the already-hydrated state.
 */
function resetAll(): void {
  useThemeStore.setState({ theme: "cozy-orange", mode: "light" });
  localStorage.clear();
  clearHtmlAttrs();
  clearInjectedStyles();
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  // Order matters: React unmounts first (so RootThemeBridge's effect
  // cleanup runs and stops touching the DOM), THEN we strip our
  // injected styles. Otherwise React's unmount could try to write
  // to a stylesheet we already removed.
  cleanup();
  resetAll();
});

describe("M7.6 — theme end-to-end flow", () => {
  it("1. default state: RootThemeBridge renders <html data-theme='cozy-orange' data-mode='light'>", async () => {
    render(<RootThemeBridge />);
    await act(async () => {
      await Promise.resolve();
    });

    const html = document.documentElement;
    // The store defaults to cozy-orange / light; the bridge should
    // have stamped both attributes on <html>.
    expect(html.getAttribute("data-theme")).toBe("cozy-orange");
    expect(html.getAttribute("data-mode")).toBe("light");
  });

  it("2. setTheme('calm-blue') is reflected on <html>", async () => {
    render(<RootThemeBridge />);
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useThemeStore.getState().setTheme("calm-blue");
    });
    // Drain pending effects — the RootThemeBridge re-runs the effect
    // when `theme` changes, so we need React to flush before asserting.
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("calm-blue");
    expect(document.documentElement.getAttribute("data-mode")).toBe("light");
  });

  it("3. setMode('dark') flips data-mode while data-theme stays", async () => {
    render(<RootThemeBridge />);
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useThemeStore.getState().setTheme("calm-blue");
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useThemeStore.getState().setMode("dark");
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("calm-blue");
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
  });

  it("4. persistence round-trip: set state, unmount, rehydrate — new mount restores <html> attrs", async () => {
    // Phase 1: set state on the live store + bridge.
    const first = render(<RootThemeBridge />);
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useThemeStore.getState().setTheme("mint");
    });
    act(() => {
      useThemeStore.getState().setMode("dark");
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("mint");
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");

    // zustand/persist wrote to localStorage — assert the envelope.
    const raw = localStorage.getItem("cozy-theme");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as {
      state?: { theme?: string; mode?: string };
    };
    expect(parsed.state?.theme).toBe("mint");
    expect(parsed.state?.mode).toBe("dark");

    // Phase 2: unmount, simulate page reload by resetting the in-memory
    // state to defaults. `useThemeStore.setState` triggers a persist
    // write that overwrites the saved payload — that's fine, we restore
    // it manually right after, which is exactly what the browser does
    // on hard reload (writes the prior payload to localStorage, then
    // re-reads it on mount).
    first.unmount();
    clearHtmlAttrs();

    useThemeStore.setState({ theme: "cozy-orange", mode: "light" });
    // Restore the saved payload so the upcoming rehydrate has something
    // to read. (In production the payload would already be in localStorage
    // from the prior session; we're rebuilding that state explicitly.)
    localStorage.setItem(
      "cozy-theme",
      JSON.stringify({ state: { theme: "mint", mode: "dark" }, version: 0 }),
    );

    expect(useThemeStore.getState().theme).toBe("cozy-orange");
    expect(useThemeStore.getState().mode).toBe("light");

    // Trigger the persist rehydrate explicitly. The middleware is
    // already wired to the same `cozy-theme` key, so rehydrate() reads
    // from localStorage and replays the saved slice.
    await act(async () => {
      await useThemeStore.persist.rehydrate();
    });

    expect(useThemeStore.getState().theme).toBe("mint");
    expect(useThemeStore.getState().mode).toBe("dark");

    // Phase 3: mount the bridge again — it should stamp <html> with
    // the rehydrated values.
    render(<RootThemeBridge />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("mint");
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
  });

  it("5. CSS resolution sanity check: mint / dark resolves to the expected accent", async () => {
    // Inject the dark mint CSS, then render the bridge with that
    // state. getComputedStyle should report the accent from
    // `src/styles/dark/mint.css` — NOT from the TypeScript registry.
    // The point: this catches a drift where one side is updated and
    // the other is not.
    injectPalette("mint", "dark");

    render(<RootThemeBridge />);
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useThemeStore.getState().setTheme("mint");
    });
    act(() => {
      useThemeStore.getState().setMode("dark");
    });
    await act(async () => {
      await Promise.resolve();
    });

    const accent = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-accent",
    );
    expect(accent.trim()).toBe(THEME_PRESETS["mint"].dark.accent);
    // Belt-and-suspenders: assert the raw CSS we read matches too.
    expect(accent.trim()).toBe("52 211 153");
  });

  it.each(
    THEME_NAMES.flatMap((theme) =>
      MODE_NAMES.map((mode) => ({ theme, mode })),
    ),
  )("6. all 10 themes resolve: $theme / $mode accent", async ({ theme, mode }) => {
    injectPalette(theme, mode);

    render(<RootThemeBridge />);
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useThemeStore.getState().setTheme(theme);
    });
    act(() => {
      useThemeStore.getState().setMode(mode);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Verify DOM attributes landed.
    expect(document.documentElement.getAttribute("data-theme")).toBe(theme);
    expect(document.documentElement.getAttribute("data-mode")).toBe(mode);

    // Verify the CSS attribute-selector resolved to the right triplet.
    // Compare against THEME_PRESETS so the test fails LOUDLY when the
    // CSS file drifts from the TypeScript registry (one of them has
    // to be wrong; the test reports both values).
    const accent = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-accent",
    );
    expect(accent.trim()).toBe(THEME_PRESETS[theme][mode].accent);

    // Spot-check one more token per palette to make sure the rest of
    // the file is intact, not just the accent line.
    const bg = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-bg",
    );
    expect(bg.trim()).toBe(THEME_PRESETS[theme][mode].bg);
  });

  it("7. CSS and TS registry agree on every (theme, mode) — full token sweep", () => {
    // This is the structural regression net for M7.1: even without
    // mounting the bridge, we can prove the CSS files match the data
    // registry by reading every file and comparing every token.
    for (const theme of THEME_NAMES) {
      for (const mode of MODE_NAMES) {
        const css = readThemeCss(theme, mode);
        for (const key of THEME_TOKEN_KEYS) {
          const re = new RegExp(`${cssVarName(key)}:\\s*(\\d+\\s+\\d+\\s+\\d+);`);
          const match = css.match(re);
          expect(
            match,
            `${theme}/${mode}/${key}: CSS file is missing or malformed`,
          ).toBeTruthy();
          expect(
            match?.[1],
            `${theme}/${mode}/${key}: CSS file drifted from themes.data.ts`,
          ).toBe(THEME_PRESETS[theme][mode][key]);
        }
      }
    }
  });
});