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
└── layout.tsx, page.tsx
```

The 4-surface build matrix is wired up in `package.json` scripts.
Each `build:<surface>` script delegates to a small Node.js wrapper
under `scripts/` so the failure modes and prerequisites are visible
in one place.

---

## Build matrix status (M3.10)

| Script | Surface | Status today | Prerequisite |
|---|---|---|---|
| `pnpm build:web` | web (SSR + BFF) | **WORKS** | none |
| `pnpm build:web:static` | static bundle (raw) | **FAILS — see below** | M6 refactor |
| `pnpm build:embed` | embed widget | **FAILS — see below** | M6 refactor |
| `pnpm build:desktop` | Tauri desktop | **FAILS — see below** | M6 refactor + Rust toolchain |
| `pnpm build:mobile` | Capacitor mobile | **FAILS — see below** | M6 refactor + Xcode / Android SDK |

> Only `pnpm build:web` runs end-to-end today. The other three surface
> scripts fail fast with a clear, documented error so CI does not
> silently waste minutes on a known-broken build.

---

## The static export problem (and the M6 fix)

`pnpm build:web:static` and `pnpm build:embed` both set
`NEXT_PUBLIC_BUILD_TARGET` to switch `next.config.ts` into
`output: 'export'` mode (also `images.unoptimized: true` and
`trailingSlash: true`).

The static export then fails on the BFF routes under `app/api/cozy/`.
There are 18 dynamic route handlers (chat streaming, voice tokens,
providers, sessions, personalities, memory, auth, the WebSocket
handshake, …) that use `cookies()`, `headers()`, JWT verification,
and other request-time APIs. Next.js 15's `output: 'export'` mode
cannot pre-render dynamic route handlers, and the build aborts with:

```
export const dynamic = "force-static"/export const revalidate not
configured on route "/api/cozy/providers" with "output: export"
```

The embed widget, Tauri shell, and Capacitor shell do not need an
in-app BFF — they talk to a remote CozyEngineV2 server directly via
`NEXT_PUBLIC_API_BASE_URL`. So the static surfaces should ship only
the page/component tree, not the BFF.

**M6 plan** (tracked separately; not in M3 scope):

1. Split `app/` into a `(client)` route group containing only the
   page/component tree, and a separate `(server)` route group for
   `app/api/`. Both stay in the same repo for now.
2. Add a `next.config.client.ts` that uses `pageExtensions` to
   exclude `route.ts` from the static-export build, OR use a
   workspace split (`apps/web`, `apps/embed`) so the BFF is not in
   the embed app's tree at all.
3. Update `scripts/build-static.mjs` to call
   `next build -c next.config.client.ts` (or equivalent) so the
   static surfaces produce a valid `out/` directory.

Until that lands, M3.10 ships the wrapper scripts that fail fast
with a clear, actionable error message instead of letting `next
build` spew the cryptic export error.

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

### Embed widget — blocked on M6

```bash
pnpm build:embed
# exits 1 with: see BUILD.md "The static export problem"
```

Once the M6 fix lands, this script will produce `out/` containing
the widget shell with a permissive `frame-ancestors *` CSP header
(set automatically when `NEXT_PUBLIC_BUILD_TARGET=embed`).

### Desktop (Tauri 2.x) — blocked on M6 + needs Rust

```bash
# 1. Install Rust: https://rustup.rs
# 2. From the repo root:
pnpm build:desktop
# exits 1 at step 1 (static build) until the M6 fix lands.
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

### Mobile (Capacitor 7.x) — blocked on M6 + needs Xcode / Android Studio

```bash
# 1. Install Xcode (iOS) and / or Android Studio (Android)
# 2. From the repo root:
pnpm build:mobile
# exits 1 at step 1 (static build) until the M6 fix lands.
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

- `scripts/build-static.mjs` — currently fails fast with the
  documented M6 error. Once M6 lands, it will call
  `npx next build` with `NEXT_PUBLIC_BUILD_TARGET=desktop` (or
  `embed` if `--embed` is passed).
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

…and each job will either succeed (`web`) or fail with a precise
explanation (the rest), without the cryptic Next.js export error.

---

## M3.10 deliverable

- `package.json` scripts delegate to `scripts/build-*.mjs` wrappers
- `scripts/build-static.mjs` documents the M6 blocker and exits 1
- `scripts/build-embed.mjs`, `scripts/build-desktop.mjs`,
  `scripts/build-mobile.mjs` chain through `build-static.mjs`
- This file (`BUILD.md`) at the repo root
- 313 existing unit tests still pass
- `pnpm typecheck` and `pnpm lint` are clean

The M6 embed/BFF refactor is the actual fix; M3.10 ships the
honest wrapper.
