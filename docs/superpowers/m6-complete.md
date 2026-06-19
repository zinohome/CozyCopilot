# M6 Complete — Embed Widget & Static-Export Refactor

**Milestone:** M6 of 8
**Date:** 2026-06-19
**Branch:** `feat/m6-embed` → `main` (pending merge)
**Plan:** [docs/superpowers/plans/2026-06-18-m6-embed.md](plans/2026-06-18-m6-embed.md)

## TL;DR

M6 ships the **embed widget**: a tiny iframe-embeddable CozyCopilot
panel that any third-party host page can drop in with a single
`<script src="loader.js" data-key="...">` tag. The widget reuses the
M4 chat components (Composer, MessageList) inside a 380×560px panel,
talks to the CozyEngineV2 backend via the existing BFF, and exposes
a postMessage contract so host pages can open/close/prefill the
widget programmatically.

The blocker this milestone had to solve first: Next.js 15's
`output: 'export'` cannot pre-render the dynamic BFF routes under
`app/api/**` (they use `cookies()`, `headers()`, JWT verification).
M6.1 works around this with a build-time directory rename — the
whole `app/api` tree is moved to `app/_api_disabled` for the
duration of the static build and restored in a `try/finally` so
the SSR web build (`pnpm build:web`) is unaffected.

| Metric | Baseline (M5) | After M6 | Delta |
|---|---|---|---|
| Test files | 84 | **96** | **+12** |
| Tests passing | 496 | **586** | **+90** |
| Files added | — | **21** | — |
| Lines added | — | **+1,712** | — |
| Routes (SSR web) | 24 | 24 | — |
| Widget bundle (`/widget/`) | — | **2.67 kB** (124 kB First Load JS shared) | new |
| Loader.js size | — | **4,237 B** (CDN-shipped) | new |
| BFF routes added | — | 1 (`/api/cozy/auth/embed-token`) | new |
| Theme presets | 1 (`cozy-orange`) | 2 (`+ calm-blue`) | new |

All gates green: `pnpm typecheck` 0 errors, `pnpm lint --max-warnings 0`
0 warnings, `pnpm test` 586/586 pass, `pnpm test:scripts` 5/5 pass,
`pnpm build:web` 24 routes, `pnpm build:embed` produces `out/` with
widget + embed/loader.js (no `out/api/`), `pnpm build:desktop` step
1 succeeds (step 2 = Rust toolchain, expected to be unavailable in CI).

## What shipped

### M6.1 — Static-export + BFF refactor

The M3.10 fail-fast `scripts/build-static.mjs` aborted with a clear
error. The supported-by-construction fix is a build-time directory
rename: `app/api` → `app/_api_disabled` for the duration of the
build, then renamed back in a `try/finally` so the SSR web build
(which doesn't invoke this script) is unaffected and a build crash
never leaves the BFF missing.

**Why the WHOLE `app/api`, not just `app/api/cozy`:** the brief
originally said to rename only `cozy/`, but `app/api/ws/chat/` is
also a `force-dynamic` route. Renaming the whole API tree is more
robust — handles every dynamic API route (current and future) without
per-route configuration.

**Why not webpack `NormalModuleReplacementPlugin`:** the App Router
discovers routes by walking the filesystem (not via webpack).
**Why not route groups:** Next.js still scans all `app/api/**`
regardless of group prefix.

`scripts/build-static.test.mjs` adds 10 vitest cases for the
rename + restore + chain logic. A `BUILD_STATIC_SKIP_NEXT=1` test
hook lets the script's chain tests run without paying the ~10s
cost of a real `next build`.

**Test coverage:** 10 cases — happy path, no-op when API dir
missing, self-healing on stale state, restoration after a thrown
error, restoration after a non-zero build exit code.

### M6.2 — Embed widget UI

`app/(embed)/widget/ChatWidget.tsx` + `FloatingBubble.tsx` +
`EmbedClient.tsx` + `src/features/embed/useEmbedConfig.ts`. The
widget is **always single-conversation** (no sidebar, no session
list, no history view — see M6.5). `useEmbedConfig` reads the
query string once on mount and is SSR-safe.

`<FloatingBubble>` is a 56px circle at `position: fixed;
bottom: 4; right: 4; z-50`. Clicking expands the panel.

`<ChatWidget>` is a 380×560 rounded panel with header (close
button), `<MessageList>` (M4), and `<Composer>` (M4, lifted to
controlled mode for M6.4 host:prefill). The Composer's existing
M4 `onSend`/`disabled`/`sessionId`/`personalityId` props are
honored — embed behavior diverges only in the controlled-mode
text override.

**Test coverage:** 27 cases across 4 test files — config parsing
(query string, hideHistory, SSR safety), bubble/panel mounting,
toggling, controlled Composer integration, theme surface.

### M6.3 — loader.js (third-party embed script)

`public/embed/loader.js` (~95 LOC including the embed-contract
comment block) is plain ES5 — no `let`/`const`/arrow functions.
Some legacy CMSs don't support them.

The loader:

1. Reads `data-` attributes from the last `<script>` tag (itself).
2. Builds the iframe URL: `${cdnBase}/widget/?key=...&personality=...&theme=...`.
3. Creates an `<iframe>` with `position: fixed; bottom: 0; right: 0; width: 0; height: 0` and `allow="microphone"`.
4. Sets up a `message` listener that filters by `evt.source === iframe.contentWindow` (no wildcard).
5. Exposes `window.CozyCopilot = { open, close, send, on }`.

`public/embed/test-page.html` is a manual smoke test page with
Open/Close/Clear buttons and an event log.

`tests/integration/m6-loader.test.ts` (6 cases) verifies the
data-attr reading, iframe creation, and event relay. Tests inject
the loader via `window.eval(readFileSync(...))` because jsdom
doesn't execute inline `textContent` of programmatically-appended
script tags — a documented deviation from the brief.

**Test coverage:** 6 cases — reads data-key, data-personality,
data-theme; creates iframe with fixed positioning; exposes
CozyCopilot.{open,close,send,on}; filters postMessage by source.

### M6.4 — postMessage bridge + embed-token auth

`app/api/cozy/auth/embed-token/route.ts` exchanges an embed key
(`ck_<32>`) for a short-lived JWT. Mirrors the existing auth
BFF pattern: `parseJsonBody` → zod regex validation → forward
to `COZY_ENGINE_URL/v1/auth/embed-token` → 200 on success, 400
on bad format, 401 on upstream rejection, 502 on transport failure.

`src/features/embed/types.ts` defines `CozyOutboundMessage` and
`CozyInboundMessage` as discriminated unions. The contract test
verifies every variant JSON-serializes and round-trips.

`useEmbedTransport({parentOrigin})`:
- `emit(msg)` posts to `window.parent` with `targetOrigin = parentOrigin ?? "*"`.
- `on(type, handler)` registers a message listener filtered by `evt.source === window.parent` AND `msg.type === type`. Returns unsubscribe.

`useEmbedAuth(key)`:
- On mount with `key !== null`, POSTs to `/api/cozy/auth/embed-token`.
- On success, writes the JWT into `useAuthStore.setAuth(...)`.
- On error, returns `status: "error"` with the BFF error body.
- Uses `AbortController` to cancel in-flight requests on unmount or key change.

`EmbedClient` calls `useEmbedTransport` + `useEmbedAuth`. After
auth, emits `cozy:ready` to the host. Passes `transport` down to
`ChatWidget`.

`ChatWidget` registers `host:close` / `host:clear` /
`host:set_personality` / `host:prefill` listeners and emits
`cozy:session_started` exactly once on the first send.

**Composer controlled-mode extension:** the M4 Composer now accepts
optional `value` / `onTextChange` props that flip it into
controlled mode. Defaults to internal state, so all M4/M5 callers
stay backward-compatible. This is what makes `host:prefill`
addressable without lifting state into ChatWidget.

**Test coverage:** 29 new cases across 4 test files — 8 BFF
cases (validation, success, 401, 500, fetch throw, default
fallbacks, URL/body), 10 useEmbedTransport cases (emit target
origins, SSR safety, source filter, type filter, unsubscribe,
multiple subscribers), 8 useEmbedAuth cases (idle, POST shape,
store write, 401, 500, fetch throw, key change re-fetch, abort
on unmount), 3 contract cases (outbound JSON round-trip,
inbound JSON round-trip, namespace isolation).

### M6.5 — Hide-history mode (verification + docs)

The v1 embed widget is single-conversation by design. M6.5 makes
this contract explicit: 5 new test cases pin that the widget
never renders a session list, history UI, or `<nav>`, regardless
of the `?hideHistory` value (unset, `0`, `1`, `true`, `false`).
The `hideHistory` field in `useEmbedConfig` gets a JSDoc explaining
that it's a forward-compat field for a future `widget-full`
variant — and a comment on `EmbedClient` warns that any
history-enabled variant MUST be a separate page, not a flag on
this widget.

**Test coverage:** 5 new cases (it.each over 4 hideHistory values
+ one explicit `hideHistory=false`).

### M6.6 — Theme integration

`src/features/embed/themes.ts` defines `EMBED_THEMES` (cozy-orange
+ calm-blue) and `resolveTheme(name)` which falls back to the
default with a `console.warn` for unknown names. Values are RGB
triplets matching Tailwind v4's `rgb(var(--color-X))` pattern in
`src/styles/tokens.css`, so every Tailwind utility class on the
embed (`bg-accent`, `text-fg`, `border-border`, ...) automatically
picks up the active preset.

`EmbedClient` adds a `useEffect` that calls
`applyTheme(resolveTheme(config.theme), document.documentElement)`
on mount and re-applies when `cfg.theme` changes. Cleanup removes
the inline overrides so a remount starts clean.

Hosts can pre-set the CSS variables themselves before the embed
script runs to apply a fully custom theme — the widget only sets
the variables on the root when `?theme=` is present.

**Test coverage:** 9 new cases (5 resolveTheme, 2 applyTheme,
2 EmbedClient integration).

### M6.9 — Integration test

`tests/integration/m6-embed.test.tsx` (4 cases) exercises the
full postMessage contract in a single jsdom pass:

1. `cozy:ready` emits after the BFF exchanges the embed key (asserts the JWT lands in `useAuthStore`).
2. `host:prefill` addresses the controlled Composer.
3. `cozy:session_started` fires exactly once on the first send.
4. `host:set_personality` updates the session store.

Two non-obvious mechanics pinned by the test:

- **Source gate:** jsdom's `MessageEvent` constructor doesn't set `source` by default. The test passes `{source: window}` explicitly — the test would silently pass with a buggy transport that skipped the `evt.source === window.parent` check.
- **Listener registration:** the ChatWidget's `useEffect` registers listeners AFTER mount. The test drains two microtasks before dispatching `host:*` messages, otherwise the test would race the effect.

## Architecture decisions

### Why a build-time directory rename for M6.1

The official Next.js 15 pattern for "I have dynamic API routes and
want static export" is `output: 'export'` + `force-static` on each
route. Our routes use `cookies()`, `headers()`, JWT verification,
and `force-dynamic` — so the pre-render pass always fails. The
three options we considered:

1. **Two Next.js projects** (one SSR, one static) — duplicates the
   `app/` tree, doubles the maintenance burden, breaks the BFF
   code-share we deliberately set up in M3.
2. **Webpack `NormalModuleReplacementPlugin`** — only matches
   `import` statements; the App Router discovers routes via a
   filesystem walk, not via webpack.
3. **Route groups `(server)`** — Next.js still scans all
   `app/api/**` regardless of group prefix.
4. **Build-time directory rename** — the only mechanism that
   works without splitting the project. The `try/finally` block
   guarantees the BFF is always restored, even on build crash.

The rename adds ~10 lines to `scripts/build-static.mjs` and is
covered by 10 vitest cases. The cost of a more "elegant" approach
(writing a Next.js plugin, splitting the project) is much higher.

### Why an embed API key (not user JWT) in `?key=`

Embed widgets are loaded on third-party host pages that don't
have the user's CozyCopilot session. The host gets an embed API
key from CozyCopilot admin (out of scope for v1) and embeds it
in the script tag. The widget exchanges the key for a short-lived
JWT via `/api/cozy/auth/embed-token`. This:

- Lets the host serve the widget without proxying user auth
- Gives CozyEngineV2 a single place to revoke compromised keys
- Keeps the existing `useAuthStore` as the JWT destination (no
  parallel auth state)

The key format `ck_<32 alphanumerics>` is regex-validated
defense-in-depth before being sent upstream. The upstream is the
real validator.

### Why plain ES5 for loader.js

Some legacy CMSs (WordPress themes from 2015, certain enterprise
templates) only support ES5. The brief mandates `var` + `function`
+ no optional chaining to maximize compatibility. The file is
excluded from ESLint to keep the `lint --max-warnings 0` gate
clean.

## Files affected (M6)

**New (21):**

```
app/(embed)/widget/ChatWidget.test.tsx
app/(embed)/widget/ChatWidget.tsx
app/(embed)/widget/EmbedClient.test.tsx
app/(embed)/widget/EmbedClient.tsx
app/(embed)/widget/FloatingBubble.test.tsx
app/(embed)/widget/FloatingBubble.tsx
app/api/cozy/auth/embed-token/route.test.ts
app/api/cozy/auth/embed-token/route.ts
public/embed/loader.js
public/embed/test-page.html
src/features/embed/themes.test.ts
src/features/embed/themes.ts
src/features/embed/types.ts
src/features/embed/useEmbedAuth.test.tsx
src/features/embed/useEmbedAuth.ts
src/features/embed/useEmbedConfig.test.tsx
src/features/embed/useEmbedConfig.ts
src/features/embed/useEmbedTransport.test.tsx
src/features/embed/useEmbedTransport.ts
tests/contract/embed-transport.contract.test.ts
tests/integration/m6-embed.test.tsx
tests/integration/m6-loader.test.ts
```

(That's 22 — 1 of these is `app/(embed)/widget/page.tsx` which was
modified, not new.)

**Modified (5):**

```
app/(embed)/widget/page.tsx                     (renders <EmbedClient />)
src/features/chat/Composer.tsx                  (+ value/onTextChange)
scripts/build-static.mjs                        (real next build)
scripts/build-scripts.check.mjs                 (updated for new behavior)
scripts/build-static.test.mjs                   (new — rename+restore tests)
BUILD.md                                        (status table reflects M6.1)
eslint.config.mjs                               (loader.js excluded)
```

## Verification

| Gate | Result |
|---|---|
| `pnpm typecheck` | 0 errors |
| `pnpm lint --max-warnings 0` | 0 errors, 0 warnings |
| `pnpm test` | 586 / 586 pass |
| `pnpm test:scripts` (node --test) | 5 / 5 pass |
| `pnpm build:web` | 24 routes, BFF intact |
| `pnpm build:web:static` | `out/` produced |
| `pnpm build:embed` | `out/widget/index.html` + `out/embed/loader.js` + `out/embed/test-page.html`; `out/api/` absent |
| `pnpm build:desktop` | step 1 (static) succeeds; step 2 (`cargo tauri build`) correctly falls through to the documented native-toolchain requirement |
| HTTP smoke (`python3 -m http.server`) | `/widget/` 200, `/embed/loader.js` 200, `/api/cozy/...` 404 (correctly excluded), `/embed/test-page.html` 200 |

## Risk register (post-M6)

| Risk | Likelihood | Status |
|---|---|---|
| postMessage events leak across origins | M | Mitigated: dual gate (`evt.source === window.parent` AND `msg.type === type`); 5 contract + integration tests pin the behavior |
| Theme CSS variable propagation is fragile | L | Mitigated: values match Tailwind v4's `rgb(var(--color-X))` format; `applyTheme` returns a cleanup function for remount safety |
| `loader.js` ES5 compatibility claim is wrong for some CMS | L | Open: we don't have a test matrix for legacy CMSs. Real-world testing post-merge. |
| Static build leaves the API tree disabled on crash | M | Mitigated: `try/finally` block in `build-static.mjs` + stale-state self-heal in `disableBff` + 10 vitest cases covering the rename + restore paths |

## Out of scope (deferred)

- `pnpm build:mobile` — the Capacitor shell was scaffolded in M3.9
  but the static export needs the build target flag wiring (the
  `build-mobile.mjs` script delegates to `build-static.mjs` but
  doesn't pass `--embed` because mobile is a separate code path).
  This is M7 territory.
- `pnpm build:desktop` step 2 — `cargo tauri build` requires the
  Rust toolchain. The script is wired; CI needs the toolchain.
- `pnpm build:desktop` step 1 verification — `build-desktop.mjs`
  chains `build-static.mjs` and verifies `out/` exists; Tauri-side
  smoke testing is post-merge work.
- A future `widget-full` embed variant that DOES show history.
- Custom theme builder UI (M7).

## Read for context

- `docs/superpowers/plans/2026-06-18-m6-embed.md` — the plan
- `docs/superpowers/specs/2026-06-10-cozycopilot-design.md` §6.3 — design (stream C, embed widget contract)
- `BUILD.md` — M3.10 closeout (the fail-fast that M6.1 unblocks)
- `app/(embed)/widget/page.tsx` — the embed page
- `app/api/cozy/auth/embed-token/route.ts` — the BFF route
- `src/features/embed/types.ts` — the postMessage contract
- `public/embed/loader.js` — the shipped embed script
