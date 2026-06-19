# M7 Complete — Themes + A11y Polish

**Milestone:** M7 of 8
**Date:** 2026-06-19
**Branch:** `feat/m7-polish` → `main` (pending merge)
**Plan:** [docs/superpowers/plans/2026-06-19-m7-polish.md](plans/2026-06-19-m7-polish.md)

## TL;DR

M7 turns CozyCopilot from "single theme, works" into "5 themes × 2 modes, keyboard-navigable, axe-clean". The visual rhythm is unchanged — every existing component still looks right — but the colors and accessibility are now considered.

| Metric | Baseline (M6) | After M7 | Delta |
|---|---|---|---|
| Test files | 96 | **104** | **+8** |
| Tests passing | 586 | **707** | **+121** |
| Theme presets | 2 (cozy-orange + calm-blue, embed-only) | **5 (cozy-orange, calm-blue, mint, lavender, mono), light + dark, web + embed** | full parity |
| `data-theme` × `data-mode` CSS files | 0 | **10** | new |
| Components with axe-clean scans | 0 | **6** | new |
| Keyboard navigation tests | 0 | **12** | new |

All gates green: `pnpm typecheck` 0 errors, `pnpm lint --max-warnings 0` 0 warnings, `pnpm test` 707/707 pass, `pnpm test:scripts` 5/5 pass, `pnpm build:web` 24 routes, `pnpm build:embed` produces `out/` with all 5 themes available via `?theme=` (no `out/api/`).

## What shipped

### M7.1 — Theme tokens source-of-truth

`src/styles/tokens.css` was a single light + dark theme (Cozy Orange). M7.1 splits it into 10 CSS files — 5 themes (`cozy-orange`, `calm-blue`, `mint`, `lavender`, `mono`) × 2 modes (`light`, `dark`) — with **two orthogonal attributes** (`data-theme` for the preset, `data-mode` for the brightness) instead of one combined `data-theme="cozy-orange-dark"`-style flag. This means adding a new theme or a dark variant is a single-file change, and the selectors stay clean (`[data-theme="X"]` for light, `[data-theme="X"][data-mode="dark"]` for dark).

The CSS files are the run-time source of truth. A new TypeScript file `src/styles/themes.data.ts` mirrors them — same RGB triplets — as `THEME_PRESETS: Record<ThemeName, Record<Mode, ThemePalette>>`. The data file is what the embed widget and the tests consume.

`tokens.css` keeps the original `:root` defaults (Cozy Orange, light, no `data-theme` attribute), so pages without any theme attribute still render correctly — eliminating FOUC for first-time visitors.

**Test coverage:** 59 new tests across 5 describe blocks — registry shape, spec values (10 — one per theme×mode), CSS/TS agreement (20 — every CSS file has 8 `--color-X` declarations matching `THEME_PRESETS`), tokens.css barrel, globals.css dark imports, and jsdom attribute-selector resolution (6 — uses `insertRule` to verify the selector chain works).

### M7.2 — Theme picker UI

A zustand store `src/stores/theme.ts` holds `{theme, mode, setTheme, setMode, toggleMode}`, persisted to `localStorage` under the key `"cozy-theme"`. SSR-safe: the store reads from `localStorage` lazily and returns the default `"cozy-orange" / "light"` when `window` is undefined (so the SSR pass doesn't crash).

`src/components/theme/ThemePicker.tsx` is a dropdown that shows the current theme's swatch + name, opens a popover with 5 swatches (one per preset, using the accent color as the swatch fill). Outside-click and Escape close it. `aria-current="true"` is on the active preset.

`src/components/theme/ThemeToggle.tsx` is a sun/moon SVG toggle with `aria-pressed` reflecting the current mode.

`src/components/theme/applyThemeToDom.ts` is the DOM effect helper — sets `data-theme` and `data-mode` on `documentElement`, returns a cleanup function, SSR-safe no-op.

`RootThemeBridge.tsx` is a tiny client `useEffect` that subscribes to store changes and calls `applyThemeToDom`. It's mounted in the root layout (`app/layout.tsx`).

A **blocking inline `<script>`** in the root `<head>` reads `cozy-theme` from localStorage and stamps `data-theme`/`data-mode` on `<html>` **before first paint**, eliminating FOUC when reloading with a non-default theme. The script inlines the theme-name allowlist (not an `import` from the zustand store, because the layout is a Server Component — importing the store there would break SSR).

A new **Settings page** at `app/(web)/settings/page.tsx` hosts the Theme section with `<ThemePicker>` + `<ThemeToggle>` plus a link to the existing providers settings.

**Test coverage:** 20 new tests across 4 files — store (defaults, setTheme/setMode, toggleMode, rehydration, validation against unknown values), applyThemeToDom (set attrs, cleanup, SSR-safe, second apply overwrites), ThemePicker (trigger renders current, opens popover, click sets theme + closes, aria-current only on active, Escape closes), ThemeToggle (aria-pressed reflects mode, click invokes toggleMode).

### M7.3 — Embed theme parity

The embed widget previously had 2 themes hardcoded in `src/features/embed/themes.ts`. M7.3 deletes the hardcoded constant and derives `EMBED_THEMES` from `THEME_PRESETS` — same single source of truth, now expanded to all 5 themes. The `EmbedTheme` type is an alias of `ThemePalette` (widened from 6 keys to 8 — `accentHover` and `mutedFg` were missing from the original embed-only shape, now present).

`useEmbedConfig`'s theme field type widens from `"cozy-orange" | "calm-blue" | (string & {})` to `ThemeName | (string & {})`. Hosts can pass `?theme=mint` (or any name from the 5) and the embed resolves it.

The embed widget only ever applies the **light** palette (no dark/light toggle in v1 embed). This is documented in the embed docs and called out as a future-variant feature.

**Test coverage:** 7 new tests — 3 `resolveTheme` (mint, lavender, mono), 3 `applyTheme` (same), 1 "EMBED_THEMES has exactly 5 keys", plus a structural shape guard.

### M7.4 — axe-core integration

Added `vitest-axe ^0.1.0` as a devDependency. The `toHaveNoViolations` matcher is wired into the global setup via `vitest-axe/extend-expect` so every test file can use it.

`tests/a11y/components.test.tsx` axe-scans the 6 major component trees:

1. `<MessageList>` (3 seeded messages, one streaming)
2. `<Composer>` (default props)
3. `<SettingsPage>` (Theme section)
4. `<ChatWidget>` (M6, full panel render)
5. `<EmbedClient>` (panel open, `useEmbedAuth` mocked to skip the BFF fetch)
6. `<FloatingBubble>` (M6)

All 6 pass with **zero critical or serious violations**. Moderate and minor violations are deferred to M8 — they're typically color-contrast issues axe can't measure in jsdom (no real layout, no real fonts), so they're better validated in a Playwright E2E pass.

**No source components were modified** in M7.4 — the existing `aria-label`/`role`/structure already pass axe in jsdom. M7.5 covers the harder fixes.

**Test coverage:** 6 new tests.

### M7.5 — Keyboard navigation audit

Walked every interactive surface and added the minimum a11y fixes for keyboard users. **No visual redesign.**

- **`<Composer>`**: added `aria-label="Message"`, `aria-describedby` linking to a hidden help text ("Press Enter to send, Shift+Enter for newline"), `focus-visible:ring-2 ring-accent` on the textarea, `aria-label="Send message"` on the send button (the visible text is "发送" — aria-label overlays for assistive tech).
- **`<MessageList>`**: `role="log"` + `aria-label` on the container; the streaming message container has `aria-live="polite"` so screen readers announce new tokens.
- **`<SessionList>`**: `aria-label="Start new conversation"` on the new-chat button, `aria-current="page"` on the active session, focus rings.
- **`<FloatingBubble>`**: `aria-haspopup="dialog"` + `aria-expanded="false"` (toggles to `"true"` when the panel is open).
- **`<ChatWidget>`**: close button gets a ref + auto-focus on mount (chosen over the composer — top-of-panel, screen-reader friendly, doesn't steal context from the dialog header). Tab/Shift+Tab is trapped inside the panel via a small `keydown` handler on `document` (no `react-focus-lock` dependency — keeps the brief's "no new deps" constraint). `aria-modal="true"` is set.
- **`<EmbedClient>`**: captures `document.activeElement` before opening the panel, restores it on close via `queueMicrotask` (so the bubble has time to remount). Falls back to `document.querySelector('[data-testid="floating-bubble"]')` if the captured snapshot has been detached.
- **`<ThemePicker>`**: trigger ref + first-swatch ref; focus moves to the first swatch when the popover opens; Escape and selection both restore focus to the trigger.

**Test coverage:** 12 new tests in `tests/a11y/keyboard.test.tsx`.

### M7.6 — Integration test

`tests/integration/m7-theme.test.tsx` (16 tests) exercises the full theme swap pipeline in a single jsdom pass:

1. Default state — `<RootThemeBridge />` stamps `<html data-theme="cozy-orange" data-mode="light">`
2. `setTheme("calm-blue")` → `<html data-theme="calm-blue">`
3. `setMode("dark")` → `<html data-theme="calm-blue" data-mode="dark">`
4. Persistence round-trip — set state → unmount → restore `localStorage` payload → `useThemeStore.persist.rehydrate()` → re-mount → `<html>` attributes restored
5. CSS resolution sanity — inject `dark/mint.css` via `insertRule`, set mint/dark, assert `getComputedStyle(--color-accent) === "52 211 153"`
6. **All 10 (theme, mode) pairs resolve** — parametrized via `it.each`, asserts both `--color-accent` and `--color-bg`. This is the **regression net for CSS/data drift**: if anyone edits a CSS file or `themes.data.ts` out of sync, this sweep catches it.
7. **Full token sweep** — for every (theme, mode, token), the CSS file string matches `THEME_PRESETS` exactly.

`afterEach` runs `cleanup()` BEFORE `resetAll()` so React unmount happens first; `clearInjectedStyles()` removes `<style>` elements from `<head>` so the test is hermetic across vitest's multi-file workers.

## Architecture decisions

### Why CSS attribute selectors (not React context for colors)

The M6.6 `applyTheme(theme, target)` writes inline styles to `documentElement`. That works for the embed widget (single root, no SSR). For the SSR web app, we want:

- **No flash of unstyled content (FOUC)** when reloading with a non-default theme.
- **Server-rendered HTML** to use the correct theme on first paint.
- **Tailwind utilities** (`bg-accent`, `text-fg`, ...) to automatically pick up the active theme without a `ThemeProvider` wrapper around every component.

Attribute-scoped CSS solves all three:

```css
:root[data-theme="calm-blue"] { --color-accent: 59 130 246; }
```

Tailwind v4's `rgb(var(--color-accent))` pattern resolves transparently — no JavaScript color logic. The blocking inline `<script>` in the root layout handles the FOUC case by setting the attributes before paint.

`applyTheme` (the inline-style version) stays as the **embed-only** mechanism because the embed widget's `?theme=` query string can arrive AFTER first paint.

### Why `data-theme` and `data-mode` as separate attributes

A combined `data-theme="cozy-orange-dark"` would force 10 attribute values and 10 attribute selectors. Two orthogonal attributes (`data-theme="cozy-orange"` + `data-mode="dark"`) give 10 combinations from 5+2 selectors. The CSS gets cleaner and adding dark variants of new themes is a one-attribute change.

### Why a CSS barrel + 10 small files (not 1 big file)

A single `tokens.css` with 5 themes × 2 modes = 10 sections is hard to scan. Splitting into `themes/{name}.css` and `themes/dark/{name}.css` means each file is ~15 lines, and adding a theme is a 2-file change with no risk of clobbering an existing preset's overrides.

### Why a data file mirroring the CSS

The CSS files are the **run-time** source of truth (they ship to the browser). The TS data file is the **test + embed** source of truth. M7.6's "all 10 pairs resolve" test verifies the two never drift. Without the data file, the embed widget would either hardcode the values (5 places to update when a color changes) or parse CSS at runtime (fragile). The data file adds 10 entries and a 16-test safety net.

## Files affected (M7)

**New (24):**

```
src/styles/themes/{cozy-orange,calm-blue,mint,lavender,mono}.css      (5)
src/styles/dark/{cozy-orange,calm-blue,mint,lavender,mono}.css        (5)
src/styles/themes.data.ts                                             (1)
src/styles/themes.test.ts                                             (1)
src/stores/theme.ts                                                  (1)
src/stores/theme.test.ts                                             (1)
src/components/theme/ThemePicker.tsx                                 (1)
src/components/theme/ThemePicker.test.tsx                            (1)
src/components/theme/ThemeToggle.tsx                                 (1)
src/components/theme/ThemeToggle.test.tsx                            (1)
src/components/theme/applyThemeToDom.ts                              (1)
src/components/theme/applyThemeToDom.test.ts                         (1)
src/components/theme/RootThemeBridge.tsx                             (1)
app/(web)/settings/page.tsx                                          (1)
app/(web)/settings/page.test.tsx                                     (1)
tests/a11y/components.test.tsx                                       (1)
tests/a11y/keyboard.test.tsx                                         (1)
tests/integration/m7-theme.test.tsx                                  (1)
```

**Modified (6):**

```
src/styles/tokens.css                          (becomes barrel + default)
src/styles/globals.css                         (+5 dark @import lines)
src/features/embed/themes.ts                   (derive EMBED_THEMES from THEME_PRESETS)
src/features/embed/useEmbedConfig.ts           (theme union widens to 5)
src/features/embed/themes.test.ts              (+7 tests)
src/features/chat/Composer.tsx                 (a11y: aria-label, aria-describedby, focus ring)
src/features/chat/MessageList.tsx              (a11y: role=log, aria-live)
src/features/sessions/SessionList.tsx          (a11y: aria-label, aria-current, focus ring)
app/(embed)/widget/ChatWidget.tsx              (a11y: close-button auto-focus, focus trap, aria-modal)
app/(embed)/widget/ChatWidget.test.tsx         (updated for new aria-label)
app/(embed)/widget/EmbedClient.tsx             (a11y: capture/restore focus)
app/(embed)/widget/FloatingBubble.tsx          (a11y: aria-haspopup, aria-expanded)
src/components/theme/ThemePicker.tsx           (a11y: focus first swatch, restore on close)
src/test/setup.ts                              (extend vitest-axe)
app/layout.tsx                                 (blocking theme script + RootThemeBridge)
package.json                                   (+vitest-axe)
```

## Verification

| Gate | Result |
|---|---|
| `pnpm typecheck` | 0 errors |
| `pnpm lint --max-warnings 0` | 0 errors, 0 warnings |
| `pnpm test` | **707 / 707 pass** across **104 files** |
| `pnpm test:scripts` (node --test) | 5 / 5 pass |
| `pnpm test tests/a11y/components.test.tsx` | 6 / 6 (M7.4 no regressions) |
| `pnpm test tests/a11y/keyboard.test.tsx` | 12 / 12 (M7.5) |
| `pnpm test tests/integration/m7-theme.test.tsx` | 16 / 16 (M7.6) |
| `pnpm build:web` | 24 routes, BFF intact |
| `pnpm build:embed` | `out/widget/index.html` + `out/embed/loader.js` + `out/embed/test-page.html`; `out/api/` absent |
| HTTP smoke | `/widget/` 200 (9.4 KB), `/embed/loader.js` 200 (4.2 KB), `/embed/test-page.html` 200 (2.8 KB) |

## Risk register (post-M7)

| Risk | Likelihood | Status |
|---|---|---|
| FOUC when reloading with non-default theme | M | **Mitigated**: blocking inline script in `<head>` reads localStorage and stamps `data-theme`/`data-mode` before paint |
| Theme picker breaks SSR | L | **Mitigated**: store reads `localStorage` lazily, returns defaults when `window` is undefined |
| Embed widget theme override clashes with host CSS | L | **Documented**: embed sets CSS variables on `documentElement`; host's own `--color-X` declarations are shadowed (same specificity; embed wins by last-cascade) |
| Stale localStorage from older versions crashes the store | L | **Mitigated**: `safeTheme`/`safeMode` validators reject unknown values, fall back to defaults |
| axe misses color-contrast issues in jsdom | M | **Accepted**: jsdom can't measure real contrast. Playwright E2E with `@axe-core/playwright` is M8 territory |
| Moderate/minor axe violations slip through | M | **Deferred**: filtered to critical/serious only in M7.4. M8 will sweep the rest |
| Focus trap interferes with screen-reader virtual cursor | L | **Open**: needs manual VoiceOver/NVDA testing post-merge |

## Out of scope (deferred)

- `@axe-core/playwright` E2E scans (M8)
- Per-component design overhaul
- Custom theme builder UI
- High-contrast / forced-colors mode
- Theme-aware illustrations
- Embed widget dark/light toggle (the embed only ships light themes in v1)

## Read for context

- `docs/superpowers/plans/2026-06-19-m7-polish.md` — the plan
- `docs/superpowers/specs/2026-06-10-cozycopilot-design.md` §9 — a11y requirements
- `docs/superpowers/m6-complete.md` — M6 closeout (the foundation this builds on)
- `src/styles/themes.data.ts` — the theme registry
- `src/stores/theme.ts` — the theme store
- `tests/integration/m7-theme.test.tsx` — the end-to-end test