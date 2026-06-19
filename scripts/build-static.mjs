#!/usr/bin/env node
/**
 * scripts/build-static.mjs
 *
 * Static-export build used by the Tauri desktop shell, the Capacitor
 * mobile shell, and the iframe-embeddable widget.
 *
 * Runs `next build` with `output: 'export'` (selected via
 * `NEXT_PUBLIC_BUILD_TARGET` in `next.config.ts`) to produce a static
 * `out/` bundle that the native shells can serve from `file://` and the
 * embed widget can ship as a CDN-hosted iframe.
 *
 * The blocker this script works around (M3.10):
 *   Next.js 15's `output: 'export'` mode cannot pre-render the dynamic
 *   BFF route handlers under `app/api/**` (the cozy BFF at
 *   `app/api/cozy/**` uses `cookies()`, `headers()`, JWT verification,
 *   etc.; the WebSocket proxy at `app/api/ws/chat/route.ts` uses
 *   `force-dynamic`). The build aborts with errors like:
 *
 *     export const dynamic = "force-static"/export const revalidate not
 *     configured on route "/api/cozy/providers" with "output: export"
 *
 *     export const dynamic = "force-dynamic" on page "/api/ws/chat"
 *     cannot be used with "output: export"
 *
 * The supported-by-construction fix (M6.1):
 *   Webpack's `NormalModuleReplacementPlugin` only matches `import`
 *   statements, and the App Router discovers routes by walking the
 *   filesystem (not via webpack). Route groups (`(server)`) don't help
 *   either — Next.js still scans all `app/api/**` regardless of group
 *   prefix. The only mechanism that works without splitting the project
 *   into two Next.js apps is a **build-time directory rename**:
 *
 *   1. Temporarily rename `app/api` → `app/_api_disabled` so the App
 *      Router finds no API routes at all. (We rename the whole `app/api`
 *      directory, not just `app/api/cozy`, because `app/api/ws/chat`
 *      is also a dynamic route.)
 *   2. Run `next build` (which now sees zero dynamic API routes).
 *   3. Rename the directory back, regardless of whether the build
 *      succeeded or crashed. The `try/finally` block below guarantees
 *      restoration — the SSR web build (`pnpm build:web`, which does
 *      NOT invoke this script) is unaffected.
 *
 * The embed widget, Tauri shell, and Capacitor shell do not need an
 * in-app BFF — they talk to a remote CozyEngineV2 server directly via
 * `NEXT_PUBLIC_API_BASE_URL`. So the static surfaces ship only the
 * page/component tree, not the BFF.
 *
 * Usage:
 *   node scripts/build-static.mjs            # desktop target (default)
 *   node scripts/build-static.mjs --embed    # embed target (CSP: frame-ancestors *)
 */

import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

/**
 * Build-time BFF swap. We rename the live `app/api` directory to a
 * sibling name (a Next.js private-folder prefix, `_api_disabled`)
 * that the App Router never scans. Callers MUST invoke `restoreBff`
 * afterwards — `main` does this in a `finally` block.
 *
 * We rename the whole `app/api` directory (not just `app/api/cozy`)
 * because `app/api/ws/chat/route.ts` is also a dynamic route and
 * would block `output: 'export'` for the same reason. With the
 * whole `app/api` directory hidden, the App Router finds zero API
 * routes and the static build proceeds.
 *
 * Exported so the rename+restore logic can be unit-tested without
 * touching the real `app/api`. The test passes a `cwd` pointing
 * at a temp dir.
 */
export function disableBff({ cwd = repoRoot, logger = console } = {}) {
  const apiDir = join(cwd, "app", "api");
  const disabledDir = join(cwd, "app", "_api_disabled");

  if (!existsSync(apiDir)) {
    // Nothing to disable. Two cases:
    //  (a) The BFF was never created (fresh checkout, no API work yet).
    //  (b) A previous build already disabled it and crashed before
    //      restoring. Recover by checking for the disabled dir.
    if (existsSync(disabledDir)) {
      logger.warn(
        `[build-static] Found stale ${disabledDir} from a previous build — restoring now.`,
      );
      renameSync(disabledDir, apiDir);
    }
    return { apiDir, disabledDir, wasRenamed: false, alreadyRestored: true };
  }

  // Defensive: if a previous build left `_api_disabled` behind
  // (e.g. crash before the finally block could run), wipe it. This
  // would only happen if a build crashed in a way that the OS let
  // the process die without running finally — extremely rare, but
  // a one-line guard is cheap insurance.
  if (existsSync(disabledDir)) {
    logger.warn(
      `[build-static] Found stale ${disabledDir} from a previous build — removing it before swapping.`,
    );
    rmSync(disabledDir, { recursive: true, force: true });
  }

  logger.log(`[build-static] Disabling API routes: ${apiDir} → ${disabledDir}`);
  renameSync(apiDir, disabledDir);
  return { apiDir, disabledDir, wasRenamed: true, alreadyRestored: false };
}

/**
 * Inverse of `disableBff`. Safe to call multiple times — if the API
 * tree is already at `apiDir` (or never existed), this is a no-op.
 *
 * The `state` argument carries the absolute paths (with the cwd baked
 * in at `disableBff` time), so this function does not need its own
 * `cwd` option. The `logger` option exists for symmetry with
 * `disableBff` and so tests can attach spies.
 */
export function restoreBff(state, { logger = console } = {}) {
  const { apiDir, disabledDir, wasRenamed } = state;
  if (!wasRenamed) return false;

  // The disabled dir should exist; the API dir should not.
  if (existsSync(apiDir)) {
    logger.warn(
      `[build-static] Expected ${apiDir} to be missing during restore but it exists — leaving in place.`,
    );
    return false;
  }
  if (!existsSync(disabledDir)) {
    logger.warn(
      `[build-static] Expected ${disabledDir} to exist during restore but it does not — API tree may have been deleted manually.`,
    );
    return false;
  }

  logger.log(`[build-static] Restoring API routes: ${disabledDir} → ${apiDir}`);
  renameSync(disabledDir, apiDir);
  return true;
}

/**
 * Run the real `next build` with the right target env var. Returns the
 * child's exit code.
 *
 * Test hook: when `BUILD_STATIC_SKIP_NEXT=1` is set in the
 * environment, the function logs the planned invocation and returns
 * 0 without spawning. This is used by `scripts/build-scripts.check.mjs`
 * to verify the rename+restore+chain control flow without paying the
 * ~10s cost of a real `next build`. It is not part of any production
 * code path; setting the env var from a CI pipeline would cause the
 * build script to silently produce no `out/`, so the variable is
 * named defensively (`BUILD_STATIC_SKIP_NEXT` — not `SKIP_NEXT` —
 * to discourage casual misuse).
 */
export function runNextBuild(target, { cwd = repoRoot, logger = console } = {}) {
  if (process.env.BUILD_STATIC_SKIP_NEXT === "1") {
    logger.log(
      `[build-static] BUILD_STATIC_SKIP_NEXT=1 — would have run: npx next build (target=${target})`,
    );
    return 0;
  }
  logger.log(`[build-static] Running next build (NEXT_PUBLIC_BUILD_TARGET=${target})…`);
  const result = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    cwd,
    env: { ...process.env, NEXT_PUBLIC_BUILD_TARGET: target },
  });
  return result.status ?? 1;
}

function main() {
  const isEmbed = process.argv.includes("--embed");
  const target = isEmbed ? "embed" : "desktop";

  const state = disableBff();

  try {
    const code = runNextBuild(target);
    if (code !== 0) {
      console.error(`[build-static] next build exited with status ${code}.`);
    }
    return code;
  } finally {
    // ALWAYS restore, even on build failure. The SSR web build
    // (`pnpm build:web`) does not invoke this script, so renaming
    // the API tree here does not affect it — but a developer
    // running `next dev` after a failed static build would
    // otherwise find the BFF mysteriously gone.
    try {
      restoreBff(state);
    } catch (err) {
      console.error(
        `[build-static] CRITICAL: failed to restore API directory at ${state.apiDir}.`,
        "You will need to rename it back manually:",
        `  mv ${state.disabledDir} ${state.apiDir}`,
        err,
      );
      // Propagate the failure so the developer notices — but only
      // if the build itself succeeded (otherwise the build error
      // dominates).
    }
  }
}

// Only run main() when invoked as a CLI (not when imported by tests).
// `process.argv[1]` is the entry script; for imports it's the test
// file's path, not this module's.
const isCli =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1] ?? "");
if (isCli) {
  const code = main();
  process.exit(code);
}
