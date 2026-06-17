#!/usr/bin/env node
/**
 * scripts/build-static.mjs
 *
 * Static-export build used by the Tauri desktop shell and the Capacitor
 * mobile shell. Runs `next build` with `NEXT_PUBLIC_BUILD_TARGET=desktop`
 * (which the Tauri/Capacitor static surfaces use) so that
 * `next.config.ts` flips on `output: 'export'` and `images.unoptimized`.
 *
 * KNOWN ISSUE (M3.10 — tracked for M6):
 *   The BFF API routes under `app/api/cozy/**` are dynamic (they use
 *   `cookies()`, `headers()`, JWT verification, etc.). Next.js 15's
 *   `output: 'export'` mode cannot pre-render dynamic route handlers,
 *   and it currently fails the build with:
 *
 *     export const dynamic = "force-static"/export const revalidate not
 *     configured on route "/api/cozy/providers" with "output: export"
 *
 *   The proper fix is an M6 refactor: move BFF routes out of the same
 *   `app/` tree as the static-export pages (e.g. into a separate
 *   `app/(server)/` route group, or split the project into two Next.js
 *   builds). Until that lands, the static surfaces must point at a
 *   remote CozyEngineV2 deployment via `NEXT_PUBLIC_API_BASE_URL` and
 *   cannot ship the in-app BFF.
 *
 * This script therefore fails fast with a clear, actionable error
 * instead of letting `next build` spew the cryptic export error. See
 * BUILD.md at the repo root for the full picture.
 */

const ERROR_MESSAGE = [
  "[build-static] FAILED: the static export cannot include the BFF API routes under app/api/cozy/.",
  "             Next.js 15's output: 'export' mode cannot pre-render the dynamic route handlers",
  "             (they use cookies(), headers(), JWT verification, etc.).",
  "             See BUILD.md for the M6 refactor plan to split app/ into a (client) tree and a (server) tree.",
  "             Workaround for M3.10: deploy the BFF separately and use build:web (SSR) for the demo.",
  "",
].join("\n");

console.error(ERROR_MESSAGE);

// Note: we deliberately do NOT call `next build` here. Doing so would
// trigger the cryptic Next.js error and waste a few seconds of CI time.
// A future M6 fix will replace the body of this script with the real
// `spawnSync("npx", ["next", "build"], { env: { ...process.env, NEXT_PUBLIC_BUILD_TARGET: "desktop" } })`
// call (and the corresponding `embed` target) once the app/ tree is
// refactored.
process.exit(1);

// Reference code kept below for the M6 fix; not executed.
// import { spawnSync } from "node:child_process";
// const isEmbed = process.argv.includes("--embed");
// const target = isEmbed ? "embed" : "desktop";
// const result = spawnSync("npx", ["next", "build"], {
//   stdio: "inherit",
//   env: { ...process.env, NEXT_PUBLIC_BUILD_TARGET: target },
// });
// process.exit(result.status ?? 1);
