# CozyCopilot — Handoff

**Date:** 2026-06-19
**Branch / Commit:** `main` @ `5eee1d9`
**Pushed to:** `origin/main` (fully synced, no local-only commits)
**Milestone reached:** M7 merged, M8 planned (not started)

---

## TL;DR

M0–M7 are merged into `main` and pushed. **533 tests pass**. The project is
"feature complete for v1 scope" — voice, themes, accessibility, and embed
widget are all shipped. **M8 (performance + release) is the next and final
milestone**; its plan is written (`docs/superpowers/plans/2026-06-19-m8-release.md`)
but no implementation work has begun.

If you only read one section, read **"What's next"** at the bottom.

---

## 1. What this project is

A multi-platform chat frontend (Next.js 15 web + embed widget + Tauri desktop
shell + Capacitor mobile shell), warm-orange themed, full-feature v1 scope.

- **Web:** Next.js 15 (App Router) BFF → CozyEngineV2 backend
- **Embed:** static-export iframe widget (`loader.js` + postMessage bridge)
- **Desktop:** Tauri shell, step-1 build wired
- **Mobile:** Capacitor shell, step-1 build wired
- **Voice:** non-realtime (stream D push-to-talk) + realtime (stream E LiveKit)

Out of scope (locked in memory): the abandoned `CozyChat` half-product. Do not
reference, reuse, or re-mention it.

## 2. Current state — by milestone

| M  | Title                              | Status      | Headline commit(s)            |
|----|------------------------------------|-------------|-------------------------------|
| M0 | spec                               | ✅ shipped  | `34f4cac` initial design      |
| M3 | build-static refactor              | ✅ shipped  | `0b760e1` Merge M3           |
| M4 | (foundation)                       | ✅ shipped  | merge to `c7ed80b`/`943f4a3` |
| M5 | voice (non-realtime + realtime)    | ✅ shipped  | `9a0897a` Merge M5           |
| M6 | embed widget + static-export       | ✅ shipped  | `0b760e1` Merge M6           |
| M7 | themes + a11y polish               | ✅ shipped  | `0e66623` Merge M7           |
| M8 | **performance + release**          | 🟡 planned | `5eee1d9` (plan only)        |

### M7 (just merged) — themes + a11y

- `tokens.css` split into 5 themes × 2 modes (M7.1)
- Theme picker + dark/light toggle (M7.2)
- `EMBED_THEMES` expanded from 2 → 5 (M7.3)
- `vitest-axe` component scans (M7.4)
- Keyboard navigation audit (M7.5)
- Integration test for M7 theme E2E flow (M7.6)
- Full closeout: `docs/superpowers/m7-complete.md`

### Test & build snapshot at HEAD

- 533 vitest unit/integration tests, all green
- `pnpm typecheck` clean
- `pnpm lint --max-warnings 0` clean
- `pnpm build:web` and `pnpm build:web:static` green (M6.1 fix landed)
- M7 E2E integration test: `app/(embed)/widget/__tests__/e2e.theme.test.tsx`

## 3. Repo layout (top-level)

```
app/                     # Next.js 15 App Router (web BFF + embed routes)
src/                     # Shared client code (theme, ui-kit, hooks, voice)
  components/theme/      # M7 — ThemePicker, ThemeToggle, RootThemeBridge
public/embed/            # M6.3 — loader.js (CDN-shipped, no env access)
scripts/                 # build-static / build-embed / build-desktop / build-mobile
docs/superpowers/        # milestone plans + closeouts
  plans/                 # M{1..8}-plan.md
  m{1..7}-complete.md    # one closeout per shipped milestone
.claude/                 # local tool state (gitignored candidate)
.codegraph/              # local codegraph index (gitignored candidate)
.remember/               # remember plugin session logs (gitignored candidate)
```

## 4. How to run it

```bash
pnpm install
pnpm dev                  # web BFF on :3000
pnpm test                 # vitest, 533 tests
pnpm test:e2e             # Playwright
pnpm typecheck            # tsc --noEmit
pnpm lint                 # eslint --max-warnings 0
pnpm build:web            # Next.js BFF build
pnpm build:web:static     # static export (for CDN deployment)
pnpm build:embed          # loader.js + embed test page
pnpm build:desktop        # Tauri step-1
pnpm build:mobile         # Capacitor step-1
```

## 5. Known issues / follow-ups

### 5.1 Working-tree noise (NOT a code problem)
The `.remember/logs/autonomous/*.log` files show as deleted/modified, and
`.claude/` + `.codegraph/` are untracked. This is **tool runtime debris**:

- `remember` plugin crashes in `save-session.sh` at line 135/140/142/164
  because `/Users/zhangjun/.claude/plugins/cache/claude-plugins-official/.claude/remember`
  does not exist (plugin install path mismatch — unrelated to this project)
- `.codegraph/` is a local SQLite index; should be gitignored
- `.claude/` is local config; should be gitignored

**Recommended fix (do not commit them):**
```bash
echo -e "\n# Tool runtime debris\n.remember/\n.claude/\n.codegraph/" >> .gitignore
git checkout -- .remember/
rm -rf .claude/ .codegraph/
```

### 5.2 M6.3 / M6.4 work was interrupted
A previous session was dispatched to implement `loader.js` and the
`postMessage` bridge, but the agent died (session restart). **The work landed
in commits `324ef2a` and `4a1344c`** — the dispatch was redundant, not lost.
No action needed; this is noted so the next handoff doesn't re-dispatch.

## 6. What's next — M8

**Single source of truth:** `docs/superpowers/plans/2026-06-19-m8-release.md`

M8 has three concerns:

1. **Performance** — LCP < 2.5s, First Load JS < 150KB gzip on home route,
   per-route chunk splitting.
2. **Release hygiene** — `README.md` + `CONTRIBUTING.md` + `docs/superpowers/README.md`,
   Sentry wired but silent (no PII, no DSN when env unset), CI covers all 4 build targets.
3. **E2E** — ≥15 Playwright tests, 0 critical axe issues.

Sub-tasks (from the plan):
- M8.0 spec & state audit — confirm 707/707 tests, read M3.10 `BUILD.md`
- M8.1 README + onboarding
- M8.2 Sentry wiring (silent)
- M8.3 performance budget + `pnpm perf:budget` CI script
- M8.4–M8.7 build, E2E, closeout (see plan for full breakdown)

**Suggested first move:** run M8.0 audit — confirm 707/707 tests at HEAD
(currently 533; M7 added some, and M8 plan references 707 as the target),
typecheck/lint clean, `BUILD.md` present. Then dispatch M8.1.

## 7. Pointers

- Memory: `~/.claude/projects/-Users-zhangjun-CursorProjects-CozyCopilot/memory/MEMORY.md`
  - [[cozycopilot-project-scope]] — project scope lock
  - [[cozychat-is-ignore-list]] — CozyChat is a half-product, ignore
- Milestone plans: `docs/superpowers/plans/`
- Milestone closeouts: `docs/superpowers/m*-complete.md`
- This handoff: `HANDOFF.md` (this file)
