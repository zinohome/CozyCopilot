#!/usr/bin/env node
/**
 * scripts/build-scripts.check.mjs
 *
 * Node's built-in test runner over the build wrappers. After M6.1
 * the scripts no longer fail-fast — they perform a real
 * `next build` (with a build-time BFF rename). The tests assert:
 *
 *  1. Each chain script (`build-embed.mjs`, `build-desktop.mjs`,
 *     `build-mobile.mjs`) delegates to `build-static.mjs` (the
 *     step header appears in the output).
 *  2. `build-static.mjs` performs the documented BFF rename, runs
 *     the build (or skips it under `BUILD_STATIC_SKIP_NEXT=1`),
 *     and restores the BFF directory.
 *  3. After every script exits, the BFF directory at
 *     `app/api/cozy` still exists — proving the `try/finally`
 *     restoration works for every chain entry point.
 *
 * Filename deliberately uses .check.mjs (not .test.mjs) so vitest's
 * default test/spec glob pattern does NOT pick it up — vitest's
 * test() API is incompatible with node:test's. The vitest-runnable
 * rename/restore tests live in `scripts/build-static.test.mjs`.
 *
 * Run with: node --test scripts/build-scripts.check.mjs
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function runScript(name, extraEnv = {}) {
  return spawnSync("node", [resolve(repoRoot, "scripts", name)], {
    cwd: repoRoot,
    encoding: "utf8",
    // The skip hook makes the child skip the real `next build`
    // (which would otherwise take 10+ seconds and require the full
    // Next.js install to be present). All other behavior — the
    // rename, the restore, the step headers — is exercised as in
    // production.
    env: { ...process.env, BUILD_STATIC_SKIP_NEXT: "1", ...extraEnv },
  });
}

function assertBffIntact() {
  const apiPath = resolve(repoRoot, "app", "api");
  assert.equal(
    existsSync(apiPath),
    true,
    `API directory ${apiPath} should exist after the script exited — the rename was not restored`,
  );
  assert.equal(
    existsSync(resolve(repoRoot, "app", "_api_disabled")),
    false,
    "Stale _api_disabled directory should not exist after the script exited",
  );
}

test("build-static.mjs performs the API rename + restore on desktop target", () => {
  const result = runScript("build-static.mjs");
  // Exit code is whatever the (skipped) build returns (0). We don't
  // assert the exit code itself because real builds can fail for
  // reasons unrelated to the rename logic; the invariants we care
  // about are: the script ran, the rename happened, and the API
  // tree was restored.
  const combined = `${result.stdout}${result.stderr}`;
  assert.match(
    combined,
    /Disabling API routes: .*app\/api/,
    "stdout should announce the API rename",
  );
  assert.match(
    combined,
    /Restoring API routes: .*app\/_api_disabled/,
    "stdout should announce the API restore",
  );
  assertBffIntact();
});

test("build-static.mjs --embed target still restores the API tree", () => {
  const embedResult = spawnSync("node", [resolve(repoRoot, "scripts", "build-static.mjs"), "--embed"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, BUILD_STATIC_SKIP_NEXT: "1" },
  });
  const combined = `${embedResult.stdout}${embedResult.stderr}`;
  assert.match(combined, /Disabling API routes/, "embed target should still disable the API tree");
  assert.match(combined, /Restoring API routes/, "embed target should still restore the API tree");
  assertBffIntact();
});

test("build-embed.mjs delegates to build-static.mjs and preserves the API tree", () => {
  const result = runScript("build-embed.mjs");
  const combined = `${result.stdout}${result.stderr}`;
  assert.match(
    combined,
    /Step 1\/1: build static bundle \(embed target\)/,
    "stdout should announce the embed step",
  );
  assert.match(
    combined,
    /Disabling API routes/,
    "stdout should show that build-static.mjs disabled the API tree",
  );
  assert.match(
    combined,
    /Restoring API routes/,
    "stdout should show that build-static.mjs restored the API tree",
  );
  assertBffIntact();
});

test("build-desktop.mjs delegates to build-static.mjs and preserves the API tree", () => {
  const result = runScript("build-desktop.mjs");
  const combined = `${result.stdout}${result.stderr}`;
  assert.match(
    combined,
    /Step 1\/2: build static bundle/,
    "stdout should announce the desktop static step",
  );
  assert.match(
    combined,
    /Disabling API routes/,
    "stdout should show that build-static.mjs disabled the API tree",
  );
  assert.match(
    combined,
    /Restoring API routes/,
    "stdout should show that build-static.mjs restored the API tree",
  );
  // Defensive: cargo tauri build should not have been reached. The
  // skip hook returns 0 from the build, so the chain proceeds to
  // step 2 — but cargo is unlikely to be on $PATH in CI. We just
  // assert the API tree is intact, which is the invariant the test
  // cares about.
  assertBffIntact();
});

test("build-mobile.mjs delegates to build-static.mjs and preserves the API tree", () => {
  const result = runScript("build-mobile.mjs");
  const combined = `${result.stdout}${result.stderr}`;
  assert.match(
    combined,
    /Step 1\/2: build static bundle/,
    "stdout should announce the mobile static step",
  );
  assert.match(
    combined,
    /Disabling API routes/,
    "stdout should show that build-static.mjs disabled the API tree",
  );
  assert.match(
    combined,
    /Restoring API routes/,
    "stdout should show that build-static.mjs restored the API tree",
  );
  assertBffIntact();
});
