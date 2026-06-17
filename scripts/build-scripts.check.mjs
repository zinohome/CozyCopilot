#!/usr/bin/env node
/**
 * scripts/build-scripts.check.mjs
 *
 * Node's built-in test runner over the four M3.10 build wrappers. The
 * tests are intentionally minimal: they assert that each script exits
 * with status 1 and prints the documented failure banner. We do not
 * exercise the (currently broken) M6 `next build` invocation because
 * the body of build-static.mjs is a fast-fail `process.exit(1)` until
 * the embed/BFF refactor lands.
 *
 * Filename deliberately uses .check.mjs (not .test.mjs) so vitest's
 * default test/spec glob pattern does NOT pick it up — vitest's
 * test() API is incompatible with node:test's.
 *
 * Run with: node --test scripts/build-scripts.check.mjs
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function runScript(name) {
  return spawnSync("node", [resolve(repoRoot, "scripts", name)], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("build-static.mjs exits 1 with the documented BFF blocker", () => {
  const result = runScript("build-static.mjs");
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
  assert.match(
    result.stderr,
    /\[build-static\] FAILED: the static export cannot include the BFF API routes/,
    "stderr should contain the documented failure banner",
  );
  assert.match(
    result.stderr,
    /BUILD\.md/,
    "stderr should point the reader at BUILD.md",
  );
});

test("build-embed.mjs exits 1 by short-circuiting through build-static", () => {
  const result = runScript("build-embed.mjs");
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
  // The embed script prints its own step header, then delegates to
  // build-static.mjs which prints the failure banner to stderr.
  const combined = `${result.stdout}${result.stderr}`;
  assert.match(
    combined,
    /Step 1\/1: build static bundle \(embed target\)/,
    "stdout should announce the embed step",
  );
  assert.match(
    result.stderr,
    /\[build-static\] FAILED/,
    "stderr should contain the build-static failure banner",
  );
});

test("build-desktop.mjs exits 1 before invoking cargo tauri build", () => {
  const result = runScript("build-desktop.mjs");
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
  const combined = `${result.stdout}${result.stderr}`;
  assert.match(
    combined,
    /Step 1\/2: build static bundle/,
    "stdout should announce the desktop static step",
  );
  assert.match(
    result.stderr,
    /Aborting before cargo tauri build/,
    "stderr should announce the abort before cargo",
  );
  // Defensive: cargo tauri build should not have been reached. If
  // cargo is installed and the static build somehow succeeds, we want
  // a loud test failure rather than a silent one.
  assert.doesNotMatch(
    combined,
    /Finished `release` profile/,
    "cargo tauri build should not have been reached",
  );
});

test("build-mobile.mjs exits 1 before invoking npx cap sync", () => {
  const result = runScript("build-mobile.mjs");
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
  const combined = `${result.stdout}${result.stderr}`;
  assert.match(
    combined,
    /Step 1\/2: build static bundle/,
    "stdout should announce the mobile static step",
  );
  assert.match(
    result.stderr,
    /Aborting before cap sync/,
    "stderr should announce the abort before cap sync",
  );
});
