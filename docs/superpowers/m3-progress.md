# M3 Progress — Platform Shells (Frontend-only, in progress)

**Milestone:** M3 of 8
**Date:** 2026-06-20 (work in progress)
**Branch:** `feat/m3-shells`
**Status:** 🟡 6 of 11 tasks complete · 4 remaining · 1 not started

---

## 1. Outcome so far

M3 is shaping the **frontend** for four surfaces: web (Next.js), embed widget, Tauri desktop, and Capacitor mobile. The core idea is a **platform-agnostic abstraction layer** — business code imports from `src/lib/{capabilities,notifications,storage}/index.ts`, and a module-load-time dispatcher routes to the right impl (`web.ts` / `tauri.ts` / `capacitor.ts`) based on runtime globals.

After M3 lands, the same Next.js bundle can run on web (no changes), inside an embed widget (no changes), inside a Tauri 2.x shell (with `tauri-plugin-store` + `@tauri-apps/plugin-notification` swapping in for the stubs), or inside a Capacitor 7.x app (with `@capacitor/preferences` + `@capacitor/local-notifications`).

**What's done:** the abstraction layer + the React hooks + the auth migration + the first voice UI component.
**What's left:** Tauri shell, Capacitor shell, build scripts, M3 wrap-up doc.

---

## 2. Deliverable gates (current state)

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm lint` | ✅ 0 errors, 0 warnings (`--max-warnings 0`) |
| `pnpm test` | ✅ **305/305 pass** across 51 files |
| `pnpm build:web` | ✅ succeeds |
| `pnpm build:embed` | ✅ (unchanged from M1/M2) |
| `pnpm build:desktop` | ⏳ M3.8 — not yet wired |
| `pnpm build:mobile` | ⏳ M3.9 — not yet wired |
| BFF route count | ✅ 16 routes + 1 WS proxy (M2 — unchanged) |

**Test growth across M3 commits:**

| Commit | Task | Tests added | Running total |
|---|---|---|---|
| `1a9ff96` | M3.1+M3.2 capability | +20 | 271 (251 → 271) |
| `da71239` | M3.3 notification | +14 | 285 (271 → 285) |
| `51c7c09` | M3.4 storage | +14 | 299 (285 → 299) |
| `9492429` | M3.5 hooks | +8 | 300 (292 baseline + 8; 7 still landed later) |
| `d324713` | M3.6 auth migration | +0 | 300 (no new tests; refactor only) |
| `2b87980` | M3.7 mic prompt | +5 | 305 |

**Final post-M3.7 commit (`2b87980`): 305 tests across 51 files.**

---

## 3. What shipped (M3 partial)

### 3.1 `src/lib/capabilities/` (M3.1+M3.2, commit `1a9ff96`)

Platform-agnostic microphone permission + `getUserMedia`.

- `web.ts` (70 LOC) — `navigator.permissions.query` + `navigator.mediaDevices.getUserMedia`
- `tauri.ts` (30 LOC) — delegates microphone to web, identifies host OS via `navigator.platform`
- `capacitor.ts` (61 LOC) — Option B stub using `window.Capacitor` global; real `@capacitor/core` + `@capacitor/permissions` deferred to **M3.9**
- `index.ts` (40 LOC) — runtime dispatch on `window.__TAURI_INTERNALS__` / `window.Capacitor`; SSR falls back to web

Exports: `checkMicrophonePermission`, `requestMicrophonePermission`, `isNativeApp`, `getPlatform`.

### 3.2 `src/lib/notifications/` (M3.3, commit `da71239`)

OS notification layer.

- `web.ts` — full browser `Notification` API
- `tauri.ts` — Option B stub (returns "default" / no-ops)
- `capacitor.ts` — Option B stub
- `index.ts` — same dispatch pattern

Exports: `requestPermission`, `getPermission`, `notify({title, body, ...})`.

### 3.3 `src/lib/storage/` (M3.4, commit `51c7c09`)

Sync key-value storage that maps to `localStorage` (web) / `tauri-plugin-store` (Tauri, M3.8) / `@capacitor/preferences` (Capacitor, M3.9).

- Sync API (`getItem` / `setItem` / `removeItem`) to match Zustand's `createJSONStorage`
- Tauri/Capacitor use an **in-memory cache** with fire-and-forget async writes (v1.0 best-effort persistence)
- `makeZustandStorage()` adapter for Zustand

### 3.4 `src/hooks/` (M3.5, commit `9492429`)

- `useCapability()` — exposes `{micPermission, isNativeApp, platform, loading, refresh}`
- `useNotify()` — exposes `{permission, busy, request(), send()}`

### 3.5 `src/stores/auth.ts` (M3.6, commit `d324713`)

Refactor: `createJSONStorage(() => localStorage)` → `createJSONStorage(() => makeZustandStorage())`. Behavior unchanged; persist key preserved as `"cozycopilot-auth"`.

### 3.6 `src/features/voice/MicPermissionPrompt.tsx` (M3.7, commit `2b87980`)

Client component with 5 conditional UI states (loading / prompt / granted / denied / unsupported), warm orange theme, calls `useCapability` + `requestMicrophonePermission`.

---

## 4. What remains (4 tasks)

### 4.1 **M3.8 — Tauri 2.x desktop shell**

- `src-tauri/` directory with `Cargo.toml`, `tauri.conf.json`, `src/main.rs`, `src/lib.rs`
- `tauri-plugin-store` + `@tauri-apps/plugin-notification` (replace Option B stubs in `src/lib/{storage,notifications}/tauri.ts`)
- Icon assets
- Verify: `pnpm tauri dev` starts a desktop window; `pnpm tauri build` produces `.app` / `.exe` / `.AppImage`

### 4.2 **M3.9 — Capacitor 7.x mobile shell**

- `capacitor.config.ts` at repo root
- `ios/` and `android/` projects
- `@capacitor/preferences` + `@capacitor/local-notifications` (replace Option B stubs in `src/lib/{storage,notifications}/capacitor.ts`)
- Verify: `pnpm cap sync` works; `pnpm cap open ios` / `pnpm cap open android` launch the IDEs

### 4.3 **M3.10 — Build scripts**

- `pnpm build:web:static` — `next build` with `output: 'export'`, for embed widget
- `pnpm build:desktop` — `next build && tauri build`
- `pnpm build:mobile` — `next build && cap sync && cap copy`

Add these to `package.json` `scripts` block.

### 4.4 **M3.11 — Final verification + M3 doc + merge**

- Run full gate suite (typecheck, lint, test, all 3 builds)
- Write `docs/superpowers/m3-complete.md` (this progress doc gets superseded)
- Push `feat/m3-shells` to `git@github.com:zinohome/CozyCopilot.git`
- Merge `feat/m3-shells` → `main`
- Tag (optional) — e.g., `v0.3.0-m3`

---

## 5. Key design decisions

### 5.1 4-file pattern (`web.ts` / `tauri.ts` / `capacitor.ts` / `index.ts`)

Every platform abstraction follows the same shape. New abstraction = copy the pattern. **Why:** the dispatcher logic and the test fixture are identical across all three (capability, notification, storage), so the pattern is self-documenting.

### 5.2 Module-load-time dispatch (not per-call)

`selectImpl()` runs once at module evaluation. `window.__TAURI_INTERNALS__` / `window.Capacitor` don't change during a session. **Trade:** faster (no global checks per call), but tests must use `vi.resetModules()` + dynamic `await import()` to test the dispatch.

### 5.3 Option B stub discipline

Tauri/Capacitor impls ship as in-memory stubs with `// M3.8 will replace this with the real ...` comments. The dispatch wiring is real; only the plugin calls inside the impls are empty. **Why:** the abstractions are testable and type-checked today, and the real plugin imports land in M3.8/M3.9 when packages are installed.

### 5.4 Sync storage over async plugins

Tauri's `tauri-plugin-store` and Capacitor's `@capacitor/preferences` are async, but Zustand's `createJSONStorage` requires sync. **Solution:** in-memory cache + fire-and-forget writes. v1.0 trade — durable persistence on native is best-effort within a session.

### 5.5 `NotifyOptions` is a union, not intersection

`web.NotifyOptions | tauri.NotifyOptions | capacitor.NotifyOptions` forces consumers to use the portable subset (`{title, body}`). The M3.5 `useNotify` JSDoc documents this. **v1.0** uses only `title + body`, so the trade is fine.

---

## 6. Files added (M3 partial — 31 files, +1762 lines)

```
src/lib/capabilities/
  web.ts (70), tauri.ts (30), capacitor.ts (61), index.ts (40)
  web.test.ts (8 tests), tauri.test.ts (2), capacitor.test.ts (4), index.test.ts (4)
src/lib/notifications/
  web.ts (62), tauri.ts (62), capacitor.ts (68), index.ts (50)
  web.test.ts (11), tauri.test.ts (6), capacitor.test.ts (6), index.test.ts (4)
src/lib/storage/
  web.ts (37), tauri.ts (30), capacitor.ts (27), index.ts (71)
  web.test.ts (4), tauri.test.ts (3), capacitor.test.ts (3), index.test.ts (4)
src/hooks/
  useCapability.ts (64), useNotify.ts (63)
  useCapability.test.ts (4), useNotify.test.ts (4)
src/features/voice/
  MicPermissionPrompt.tsx (78), MicPermissionPrompt.test.tsx (5)
src/stores/auth.ts (modified, +11/-2)
```

---

## 7. Commits on `feat/m3-shells`

```
2b87980 feat(voice): add MicPermissionPrompt component with all 5 state UIs
9492429 feat(hooks): add useCapability and useNotify React hooks
d324713 refactor(auth): use platform-agnostic lib/storage instead of direct localStorage
51c7c09 feat(storage): add platform-agnostic storage abstraction (web/tauri/capacitor)
da71239 feat(notifications): add platform-agnostic notification abstraction (web/tauri/capacitor)
1a9ff96 feat(capabilities): add platform-agnostic capability abstraction (web/tauri/capacitor)
173863b plan: M3 — Tauri + Capacitor shells + capabilities + mic permission  ← main tip
```

---

## 8. How to continue on another machine

```bash
cd /path/to/CozyCopilot
git fetch origin
git checkout feat/m3-shells
# Working tree should be clean: 305/305 tests pass

# Resume from M3.8 (Tauri shell):
# Read this file: docs/superpowers/m3-progress.md
# Read the M3 plan:  docs/superpowers/plans/2026-06-20-m3-shells.md
# Read the M2 done doc for context: docs/superpowers/m2-complete.md
```

The next concrete step is **M3.8** (Tauri 2.x scaffold). Dispatch it as a single implementer agent with the worktree at `.claude/worktrees/m3-shells` and the branch `feat/m3-shells`. M3.9 (Capacitor) can run in parallel — it touches different files.

**Note for the next session:** the parallel-dispatch pattern works as long as the file scopes are non-overlapping. M3.5 (hooks) and M3.7 (mic prompt) raced once; the M3.7 implementer noticed and adapted by using the hook's exact signature from the brief, which is the right discipline.

---

## 9. References

- M3 plan: `docs/superpowers/plans/2026-06-20-m3-shells.md` (603 lines, comprehensive)
- M2 plan: `docs/superpowers/plans/2026-06-15-m2-bff-coverage.md`
- M2 final doc: `docs/superpowers/m2-complete.md`
- M1 plan: `docs/superpowers/plans/2026-06-10-cozycopilot-plan.md`
- M1 final doc: `docs/superpowers/m1-complete.md`
- Design spec: `docs/superpowers/specs/2026-06-10-cozycopilot-design.md`
