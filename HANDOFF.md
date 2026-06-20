# CozyCopilot — Handoff (Cross-Workspace)

> **Read this first.** This document is **self-contained**. A new agent in
> a fresh clone can start work without reading anything else — every fact
> needed to begin M8 is here. Other docs are linked as **drill-downs**, not
> prerequisites.

**Snapshot:** `main @ 5ae102c` · 2026-06-19 · Pacific/Shanghai
**Repo:** `github.com:zinohome/CozyCopilot`
**Working tree:** clean (`.remember/`, `.claude/`, `.codegraph/` gitignored)

---

## 1. What is CozyCopilot

A multi-platform chat frontend. One Next.js 15 codebase, four surfaces:

| Surface | Stack | Output | Audience |
|---|---|---|---|
| **web** | Next.js 15 (App Router) + React 19 | SSR bundle, in-app BFF at `app/api/cozy/**` | cozycopilot.com visitors |
| **embed** | Static export | `out/` + `public/embed/loader.js` (CDN-shipped) | 3rd-party sites via `<script>` tag |
| **desktop** | Tauri 2.x | Tauri bundle + static `out/` | macOS / Windows / Linux users |
| **mobile** | Capacitor 7.x | iOS / Android shell + static `out/` | iOS / Android users |

**Backend dependency:** CozyEngineV2 (separate system). The Next.js BFF
proxies to it; static surfaces point at it directly via
`NEXT_PUBLIC_API_BASE_URL`.

**Visual identity:** warm-orange default theme, 4 additional themes (calm-blue, mint, lavender, mono), light + dark modes. Orthogonal `data-theme` × `data-mode` on `<html>`.

**Out of scope (forbidden references):** `CozyChat` — abandoned half-product, never reference, never reuse.

---

## 2. State of the milestone pipeline

| # | Title | Status | Source of truth |
|---|---|---|---|
| M0 | spec | ✅ merged | `34f4cac` initial design |
| M3 | build-static refactor | ✅ merged | merge to `0b760e1` |
| M4 | foundation | ✅ merged | merge via `c7ed80b`/`943f4a3` |
| M5 | voice (non-realtime + realtime LiveKit) | ✅ merged | `9a0897a` Merge M5 |
| M6 | embed widget + static-export refactor | ✅ merged | `0b760e1` Merge M6 |
| M7 | themes + a11y polish | ✅ merged | `0e66623` Merge M7 |
| **M8** | **performance + release** | **🟡 planned — next** | [`docs/superpowers/plans/2026-06-19-m8-release.md`](docs/superpowers/plans/2026-06-19-m8-release.md) |
| M8.7 | release / tag | — | (no plan yet — write at end) |

The full plan for M8 lives in the file linked above. **Read it before
touching anything in M8.** M8 is the *last* milestone (M8 of 8).

### M7 closeout — the headline numbers

| Metric | Baseline (M6) | After M7 |
|---|---|---|
| Test files | 96 | 104 |
| Tests passing | 586 | 707 |
| Theme presets | 2 | 5 (× 2 modes) |
| `data-theme` × `data-mode` CSS files | 0 | 10 |
| Keyboard navigation tests | 0 | 12 |

All gates green at M7 merge: `pnpm typecheck` 0 errors, `pnpm lint --max-warnings 0` 0 warnings, `pnpm test` 707/707, `pnpm build:web` 24 routes, `pnpm build:embed` produces `out/` with all 5 themes.

Full M7 detail: [`docs/superpowers/m7-complete.md`](docs/superpowers/m7-complete.md).

---

## 3. Headline numbers at handoff

- **Commits on `main`:** 36 (since fork)
- **Routes** (`app/**/route.ts` + page handlers): 21 dynamic BFF + 8 pages = 29 in-app entry points
- **Tests:** 707 passing across 104 files
- **Build:** `pnpm build:web` and `pnpm build:web:static` both green; `pnpm build:embed` produces all 5 themes via `?theme=` query
- **TypeScript:** `strict: true`, `target: ES2022`, `moduleResolution: bundler`

---

## 4. Repo layout

```
CozyCopilot/
├── app/                       Next.js 15 App Router
│   ├── (web)/                 full SSR pages (chat, login, settings)
│   ├── (embed)/widget         iframe-embeddable widget (ChatWidget, FloatingBubble)
│   ├── api/cozy/**            in-app BFF (dynamic — not in static export)
│   ├── api/ws/chat            WebSocket proxy (dynamic)
│   ├── layout.tsx             root layout — inlines FOUC-blocking theme script
│   └── page.tsx
├── src/
│   ├── components/theme/      M7 — ThemePicker, ThemeToggle, RootThemeBridge
│   ├── styles/                M7 — tokens.css + 10 theme×mode CSS files + themes.data.ts
│   ├── stores/                zustand stores (theme, etc.)
│   ├── voice/                 M5 — non-realtime (stream D) + LiveKit realtime (stream E)
│   ├── components/ui-kit/     design-system primitives
│   └── hooks/                 shared client hooks
├── public/
│   ├── embed/                 M6 — loader.js (CDN-shipped, no env access, no Sentry)
│   └── ...                    static assets
├── scripts/                   build-static, build-embed, build-desktop, build-mobile, build-scripts.check
├── docs/
│   ├── superpowers/plans/     one .md per milestone plan
│   └── superpowers/           one m{N}-complete.md per shipped milestone
├── tests/e2e/                 M8.5 will land Playwright tests here (currently empty)
├── BUILD.md                   build matrix — read this for surface quirks
├── HANDOFF.md                 THIS FILE
├── package.json               pnpm@9.12.0, node >=20
├── tsconfig.json              strict
├── next.config.ts             switches `output: 'export'` when NEXT_PUBLIC_BUILD_TARGET=embed
├── .nvmrc                     20
└── .gitignore                 ignores .remember/, .claude/, .codegraph/, node_modules/, .next/, out/
```

---

## 5. How to run it

```bash
# Setup
nvm use                       # node 20
pnpm install --frozen-lockfile

# Web BFF (most common)
pnpm dev                      # http://localhost:3000
pnpm build:web && pnpm start

# Static surfaces
pnpm build:web:static         # static export of web (used by Tauri/Capacitor)
pnpm build:embed              # loader.js + widget test page

# Native shells (step 1 only at this commit — step 2 needs native toolchain)
pnpm build:desktop            # requires Rust
pnpm build:mobile             # requires Xcode / Android SDK

# Tests
pnpm test                     # vitest unit + integration (707 tests)
pnpm test:e2e                 # Playwright — empty until M8.5
pnpm test:scripts             # tests for the build scripts themselves (5 tests)
pnpm typecheck                # tsc --noEmit, 0 errors expected
pnpm lint                     # eslint --max-warnings 0, 0 warnings expected
```

### Mock login (for dev / smoke)

The web app uses mock credentials — see M2 plan for the seed user. (Add
the exact credentials here if you have them, otherwise the dev console
will tell you.)

### Theme smoke

```bash
# In dev, open http://localhost:3000/settings — pick theme + toggle mode
# Verify in DevTools: <html data-theme="calm-blue" data-mode="dark">

# Embed widget
# Open http://localhost:3000/widget/?theme=mint
```

---

## 6. Build matrix quirks — **read BUILD.md for full details**

Two things will bite you:

1. **The static export rename.** `scripts/build-static.mjs` renames
   `app/api` → `app/_api_disabled` before `next build` so the dynamic BFF
   and WebSocket proxy don't break `output: 'export'`. Don't run
   `pnpm build:web:static` and `pnpm dev` at the same time — the rename
   will crash your dev server. Always re-run the rename *back* before
   switching surfaces (the script does this automatically, but if you
   invoke `next` manually you're on your own).

2. **Sentry is silent until M8.2.** No telemetry is being collected right
   now. When M8.2 lands, Sentry will be a no-op unless `SENTRY_DSN` is
   set — the absence of a DSN is not a misconfiguration.

---

## 7. What's next — M8 kickoff

**Read the plan first:** [`docs/superpowers/plans/2026-06-19-m8-release.md`](docs/superpowers/plans/2026-06-19-m8-release.md)

The plan has 7 sub-tasks (M8.0–M8.6, plus M8.7 closeout). Three concerns:
1. **Performance** — LCP < 2.5s on `/chat`, First Load JS < 150KB gzip.
2. **Release hygiene** — README, CONTRIBUTING, Sentry silent, CI for 4 build targets.
3. **E2E** — ≥15 Playwright tests, 0 critical axe violations.

### Recommended first move: M8.0 — spec & state audit

```bash
# Confirm the baseline before changing anything
pnpm install --frozen-lockfile
pnpm typecheck                          # expect 0 errors
pnpm lint                               # expect 0 warnings
pnpm test                               # expect 707/707 pass
cat BUILD.md                            # re-read for static-export caveats
git log --oneline -10                   # confirm HEAD matches this handoff (5ae102c)
```

If tests ≠ 707, audit `git diff <m7-merge>..HEAD -- '*.test.*'` to find
what changed (the M7 closeout is the source of truth for the 707 number).

### Then in order

M8.1 (README + onboarding) → M8.2 (Sentry silent) → M8.3 (perf budget)
→ M8.4 (manual smoke checklist) → M8.5 (15 Playwright tests + axe)
→ M8.6 (CI for 4 build targets) → M8.7 (closeout doc + tag).

Each sub-task is small enough to be one agent dispatch. The plan file
has the acceptance criteria per sub-task.

---

## 8. Conventions

These are the conventions the previous milestones established. Stick to them.

- **Conventional commits** — `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`. Scope with `(area)` when relevant, e.g. `feat(theme):`, `test(embed):`.
- **One milestone per merge commit** — `Merge M{N}: <title>`. Closeout doc ships in the same PR.
- **Plans live in `docs/superpowers/plans/`** — `<YYYY-MM-DD>-m{N}-<slug>.md`.
- **Closeouts live in `docs/superpowers/`** — `m{N}-complete.md`.
- **Don't rename or restructure `app/` route groups** — they're load-bearing for the build script.
- **No `output: 'export'` for BFF routes** — if you find yourself wanting to call `cookies()` / `headers()` from a static-exported page, stop and reconsider.
- **Embed widget is CDN-shipped** — no env access, no Sentry, no secrets. Anything dynamic goes through postMessage to the host page or through the BFF.

---

## 9. Pointers

- **M8 plan (drill-down):** [`docs/superpowers/plans/2026-06-19-m8-release.md`](docs/superpowers/plans/2026-06-19-m8-release.md)
- **M7 closeout (drill-down):** [`docs/superpowers/m7-complete.md`](docs/superpowers/m7-complete.md)
- **Build matrix:** [`BUILD.md`](BUILD.md)
- **All milestone plans:** `docs/superpowers/plans/`
- **All milestone closeouts:** `docs/superpowers/m{1..7}-complete.md`
- **Memory (this host only — for human reference, not in the repo):** `~/.claude/projects/-Users-zhangjun-CursorProjects-CozyCopilot/memory/MEMORY.md`

---

## 10. Hand-off signature

- **Written by:** session 2026-06-19, agent MiniMax-M3
- **Last commit on `main`:** `5ae102c chore: gitignore tool runtime debris (.remember, .claude, .codegraph)`
- **Working tree:** clean
- **Next action:** M8.0 (audit), then M8.1