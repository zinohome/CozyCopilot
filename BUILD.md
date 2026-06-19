# CozyCopilot — Build Matrix

CozyCopilot ships as a single Next.js 15 + React 19 codebase that
targets **four surfaces**:

| Surface | What it is | Output | Native shell |
|---|---|---|---|
| **web** | Full SSR web app at cozycopilot.com (with the in-app BFF) | Next.js server bundle | n/a (browser) |
| **embed** | Iframe-embeddable chat widget for third-party sites | Static `out/` with `frame-ancestors *` CSP | n/a (browser iframe) |
| **desktop** | Native desktop app (macOS / Windows / Linux) | Tauri 2.x bundle + static `out/` | Tauri |
| **mobile** | Native iOS + Android app | Capacitor 7.x bundle + static `out/` | Capacitor |

The `app/` tree is organized as:

```
app/
├── (web)/         — full SSR pages (chat, login, etc.)
├── (embed)/widget — iframe-embeddable widget
├── api/cozy/**    — BFF routes (dynamic; cannot be statically exported)
├── api/ws/chat    — WebSocket proxy (dynamic; cannot be statically exported)
└── layout.tsx, page.tsx
```

The static build script (`scripts/build-static.mjs`) renames the
whole `app/api` directory to `app/_api_disabled` for the duration
of the build (see "The static export problem" below), so neither
the BFF nor the WebSocket proxy end up in the static `out/`.

The 4-surface build matrix is wired up in `package.json` scripts.
Each `build:<surface>` script delegates to a small Node.js wrapper
under `scripts/` so the failure modes and prerequisites are visible
in one place.

---

## Build matrix status (M6.1)

| Script | Surface | Status today | Prerequisite |
|---|---|---|---|
| `pnpm build:web` | web (SSR + BFF) | **WORKS** | none |
| `pnpm build:web:static` | static bundle (raw) | **WORKS** (M6.1) | none |
| `pnpm build:embed` | embed widget | **WORKS** (M6.1) | none |
| `pnpm build:desktop` | Tauri desktop | step 1 **WORKS** (M6.1); step 2 needs Rust | Rust toolchain |
| `pnpm build:mobile` | Capacitor mobile | step 1 **WORKS** (M6.1); step 2 needs Xcode / Android SDK | Xcode / Android Studio |

> As of M6.1, every static surface produces a valid `out/` bundle.
> The Tauri and Capacitor chains still need their respective
> native toolchains to produce the signed binary — those steps
> are unchanged from M3.10.

---

## The static export problem (and the M6.1 fix)

`pnpm build:web:static` and `pnpm build:embed` both set
`NEXT_PUBLIC_BUILD_TARGET` to switch `next.config.ts` into
`output: 'export'` mode (also `images.unoptimized: true` and
`trailingSlash: true`).

The static export used to fail on the dynamic BFF routes under
`app/api/**` (the cozy BFF at `app/api/cozy/**` uses `cookies()`,
`headers()`, JWT verification, etc.; the WebSocket proxy at
`app/api/ws/chat/route.ts` uses `force-dynamic`). The build aborted
with errors like:

```
export const dynamic = "force-static"/export const revalidate not
configured on route "/api/cozy/providers" with "output: export"

export const dynamic = "force-dynamic" on page "/api/ws/chat"
cannot be used with "output: export"
```

The embed widget, Tauri shell, and Capacitor shell do not need an
in-app BFF — they talk to a remote CozyEngineV2 server directly via
`NEXT_PUBLIC_API_BASE_URL`. So the static surfaces ship only the
page/component tree, not the BFF.

**M6.1 fix (in-tree, no project split):**

The static build script (`scripts/build-static.mjs`) renames the
whole `app/api` directory to `app/_api_disabled` for the duration
of the build, so the App Router finds zero API routes and the
static pre-render pass succeeds. The directory is renamed back in
a `try/finally` block, so the SSR web build is unaffected (it
never invokes the static script) and a crashed build never leaves
the BFF missing.

Why a directory rename (and not webpack alias or route group):

- Webpack's `NormalModuleReplacementPlugin` only matches `import`
  statements. The App Router discovers routes by walking the
  filesystem, not via webpack, so the plugin can't hide routes
  from the router.
- Route groups (`(server)`) don't help — Next.js still scans all
  `app/api/**` regardless of group prefix.
- The supported-by-construction approach is the build-time
  directory rename. Documented in the script's header comment.

Earlier versions of this document planned a two-config or
multi-zone split. The directory-rename approach is smaller and
keeps a single `app/` tree, so the M6.2+ widget UI work and the
M3–M5 page/component work can proceed without coordination.

---

## Per-surface manual build commands

### Web (SSR, includes BFF) — works today

```bash
pnpm build:web
# or equivalently:
pnpm build
```

This produces the Next.js server bundle in `.next/`. Deploy to any
Node 20+ host (Vercel, Render, Fly, your own box, …) and run:

```bash
pnpm start
```

The BFF lives at `https://<host>/api/cozy/...` and is served by the
same Node process.

### Embed widget — works (M6.1)

```bash
pnpm build:embed
```

Produces `out/` containing the widget shell (`out/widget/index.html`)
plus the other static pages, with a permissive `frame-ancestors *`
CSP header (set automatically when `NEXT_PUBLIC_BUILD_TARGET=embed`).
The `out/api/**` directory is intentionally absent — the BFF is
excluded by the build-time directory rename.

### Desktop (Tauri 2.x) — works for the static step (M6.1); needs Rust

```bash
# 1. Install Rust: https://rustup.rs
# 2. From the repo root:
pnpm build:desktop
# step 1 (static build) succeeds in M6.1
# step 2 (cargo tauri build) needs the Rust toolchain
```

Tauri's `beforeBuildCommand` in `src-tauri/tauri.conf.json` is wired
to `pnpm build:web:static`, and `frontendDist: "../out"` points at
the static Next.js bundle. So the chain is:

```
pnpm build:desktop
└── node scripts/build-desktop.mjs
    ├── node scripts/build-static.mjs     # produces out/
    └── cargo tauri build                  # from src-tauri/
        └── (Tauri runs `pnpm build:web:static` as beforeBuildCommand
             as a safety net; the explicit step above short-circuits it
             when out/ already exists.)
```

Native bundle outputs land in `src-tauri/target/release/bundle/`:

- macOS: `.app` and `.dmg`
- Windows: `.msi` and `.exe`
- Linux: `.deb` and `.AppImage`

### Mobile (Capacitor 7.x) — works for the static step (M6.1); needs Xcode / Android Studio

```bash
# 1. Install Xcode (iOS) and / or Android Studio (Android)
# 2. From the repo root:
pnpm build:mobile
# step 1 (static build) succeeds in M6.1
# step 2 (npx cap sync) needs Xcode / Android Studio
```

Capacitor's `webDir: "out"` in `capacitor.config.ts` points at the
static Next.js bundle. The chain is:

```
pnpm build:mobile
└── node scripts/build-mobile.mjs
    ├── node scripts/build-static.mjs     # produces out/
    └── npx cap sync                      # copies out/ into ios/ and android/
```

After sync, open the native IDE to produce the signed binary:

```bash
pnpm cap:open:ios       # → Xcode → Product > Archive
pnpm cap:open:android   # → Android Studio → Build > Generate Signed Bundle
```

---

## What the wrapper scripts actually do

Each `scripts/build-*.mjs` is intentionally short and prints a clear
status line per step. They propagate child exit codes so a failure
short-circuits the chain. Specifically:

- `scripts/build-static.mjs` — performs the build-time
  `app/api` → `app/_api_disabled` rename, runs
  `npx next build` with `NEXT_PUBLIC_BUILD_TARGET=desktop` (or
  `embed` if `--embed` is passed), then renames the API tree
  back. Restoration is in a `try/finally` block, so a build
  crash never leaves the BFF missing.
- `scripts/build-embed.mjs` — calls `build-static.mjs --embed`.
- `scripts/build-desktop.mjs` — calls `build-static.mjs`, then
  `cargo tauri build` (or `pnpm exec tauri build` if `cargo` is
  not on PATH).
- `scripts/build-mobile.mjs` — calls `build-static.mjs`, then
  `npx cap sync`.

This means a CI matrix can be wired as:

```yaml
matrix:
  surface: [web, web:static, embed, desktop, mobile]
steps:
  - run: pnpm install
  - run: pnpm build:${{ matrix.surface }}
```

…`web` and `web:static` and `embed` succeed unconditionally. The
`desktop` and `mobile` jobs succeed once the relevant native
toolchain (Rust / Xcode / Android Studio) is on the runner. The
script propagates the right exit code at every step.

---

## M6.1 deliverable

- `scripts/build-static.mjs` now performs the real `next build`
  with a build-time BFF rename (no project split, no config split)
- `pnpm build:web` still produces 24 SSR routes
- `pnpm build:web:static` produces `out/` (was a fail-fast)
- `pnpm build:embed` produces `out/` with `widget/index.html`
  (was a fail-fast)
- `pnpm build:desktop` step 1 succeeds; step 2 (`cargo tauri
  build`) still needs the Rust toolchain
- `pnpm build:mobile` step 1 succeeds; step 2 (`npx cap sync`)
  still needs Xcode / Android Studio
- `out/api/**` is intentionally absent from every static surface
- 506 tests pass (496 baseline + 10 new in
  `scripts/build-static.test.mjs`)
- `pnpm typecheck` and `pnpm lint --max-warnings 0` are clean

M6.2+ ships the embed widget UI, loader.js, and the postMessage
bridge — those are independent of the build script.
