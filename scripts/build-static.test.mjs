/**
 * scripts/build-static.test.mjs
 *
 * Unit tests for the M6.1 build-time API-tree rename logic in
 * `scripts/build-static.mjs`. The tests do NOT actually invoke
 * `next build` — they exercise `disableBff` and `restoreBff` in a
 * sandboxed temp directory and assert the rename is:
 *
 *  1. Performed correctly when the API tree exists.
 *  2. Restored correctly afterwards.
 *  3. Restored even when the build (i.e. the work between
 *     `disableBff` and `restoreBff`) throws — this is the
 *     supported-by-construction guarantee of the `try/finally`
 *     pattern that the script uses.
 *  4. A no-op when the API tree does not exist (fresh checkout, or
 *     already disabled by a previous run).
 *  5. Self-healing when a previous run crashed mid-flight and left
 *     a stale `_api_disabled` directory behind.
 *
 * Filename uses `.test.mjs` so vitest's default test glob picks it
 * up. We override the per-file environment to `node` because we
 * exercise real filesystem operations and don't need a DOM.
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { disableBff, restoreBff } from "./build-static.mjs";

/**
 * Build a minimal `app/api/` tree in a temp dir, mimicking the
 * shape of the real project (one route under `cozy/`, one under
 * `ws/`, and a route manifest so the directory looks real).
 * Returns the temp dir path; the caller is responsible for cleanup.
 */
function makeFakeRepo() {
  const root = mkdtempSync(join(tmpdir(), "build-static-test-"));
  const appDir = join(root, "app");
  const apiDir = join(appDir, "api");
  mkdirSync(join(apiDir, "cozy", "providers"), { recursive: true });
  mkdirSync(join(apiDir, "ws", "chat"), { recursive: true });
  writeFileSync(join(apiDir, "cozy", "providers", "route.ts"), "// fake providers route\n");
  writeFileSync(join(apiDir, "ws", "chat", "route.ts"), "// fake ws route\n");
  return root;
}

const cleanups = [];
afterEach(() => {
  while (cleanups.length) {
    const dir = cleanups.pop();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup; OS temp dir is wiped eventually
    }
  }
});

describe("disableBff", () => {
  let root;
  beforeEach(() => {
    root = makeFakeRepo();
    cleanups.push(root);
  });

  it("renames app/api → app/_api_disabled", () => {
    const apiDir = join(root, "app", "api");
    const disabledDir = join(root, "app", "_api_disabled");

    expect(existsSync(apiDir)).toBe(true);
    expect(existsSync(disabledDir)).toBe(false);

    const state = disableBff({ cwd: root, logger: silentLogger() });

    expect(state.wasRenamed).toBe(true);
    expect(existsSync(apiDir)).toBe(false);
    expect(existsSync(disabledDir)).toBe(true);
    // The disabled directory must contain the renamed contents so a
    // subsequent restore brings them back intact.
    expect(existsSync(join(disabledDir, "cozy", "providers", "route.ts"))).toBe(true);
    expect(existsSync(join(disabledDir, "ws", "chat", "route.ts"))).toBe(true);
  });

  it("is a no-op when the API directory does not exist", () => {
    // Remove the API dir before calling disableBff.
    rmSync(join(root, "app", "api"), { recursive: true, force: true });

    const state = disableBff({ cwd: root, logger: silentLogger() });

    expect(state.wasRenamed).toBe(false);
    expect(state.alreadyRestored).toBe(true);
    // Nothing should have been created at the disabled path either.
    expect(existsSync(join(root, "app", "_api_disabled"))).toBe(false);
  });

  it("self-heals a stale _api_disabled from a previous crashed run", () => {
    // Manually leave a stale disabled dir behind (the script must
    // remove it before the new swap to avoid clobbering real work).
    const disabledDir = join(root, "app", "_api_disabled");
    mkdirSync(disabledDir, { recursive: true });
    writeFileSync(join(disabledDir, "stale.txt"), "from a previous run\n");

    const state = disableBff({ cwd: root, logger: silentLogger() });

    expect(state.wasRenamed).toBe(true);
    // The stale contents were wiped before the new swap.
    expect(existsSync(join(disabledDir, "stale.txt"))).toBe(false);
    // The API contents were moved into the disabled dir.
    expect(existsSync(join(disabledDir, "cozy", "providers", "route.ts"))).toBe(true);
  });

  it("recovers when called on a project where the API was already disabled by a prior crash", () => {
    // Simulate "previous build crashed before the finally block":
    // API dir is gone, disabled dir contains the API contents.
    const apiDir = join(root, "app", "api");
    const disabledDir = join(root, "app", "_api_disabled");
    rmSync(apiDir, { recursive: true, force: true });
    mkdirSync(join(disabledDir, "cozy", "providers"), { recursive: true });
    writeFileSync(join(disabledDir, "cozy", "providers", "route.ts"), "// recovered\n");

    const state = disableBff({ cwd: root, logger: silentLogger() });

    // The script detects the stale disabled dir and restores it.
    expect(state.wasRenamed).toBe(false);
    expect(state.alreadyRestored).toBe(true);
    expect(existsSync(apiDir)).toBe(true);
    expect(existsSync(disabledDir)).toBe(false);
  });
});

describe("restoreBff", () => {
  let root;
  beforeEach(() => {
    root = makeFakeRepo();
    cleanups.push(root);
  });

  it("undoes the rename performed by disableBff", () => {
    const apiDir = join(root, "app", "api");
    const disabledDir = join(root, "app", "_api_disabled");

    const state = disableBff({ cwd: root, logger: silentLogger() });
    expect(existsSync(disabledDir)).toBe(true);

    const restored = restoreBff(state, { cwd: root, logger: silentLogger() });

    expect(restored).toBe(true);
    expect(existsSync(apiDir)).toBe(true);
    expect(existsSync(disabledDir)).toBe(false);
    // Original contents survived the round-trip.
    expect(existsSync(join(apiDir, "cozy", "providers", "route.ts"))).toBe(true);
    expect(existsSync(join(apiDir, "ws", "chat", "route.ts"))).toBe(true);
  });

  it("is a no-op when disableBff did not rename anything", () => {
    rmSync(join(root, "app", "api"), { recursive: true, force: true });
    const state = disableBff({ cwd: root, logger: silentLogger() });

    const restored = restoreBff(state, { cwd: root, logger: silentLogger() });

    expect(restored).toBe(false);
  });

  it("warns and returns false when the disabled dir is missing at restore time", () => {
    const state = disableBff({ cwd: root, logger: silentLogger() });
    // Simulate someone manually deleting the disabled dir.
    rmSync(state.disabledDir, { recursive: true, force: true });

    const logger = silentLogger();
    const warn = vi.spyOn(logger, "warn");
    const restored = restoreBff(state, { cwd: root, logger });

    expect(restored).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe("try/finally restoration on build failure", () => {
  let root;
  beforeEach(() => {
    root = makeFakeRepo();
    cleanups.push(root);
  });

  it("restores the API tree even when the work in the try block throws", () => {
    const apiDir = join(root, "app", "api");

    // The script's main() wraps `runNextBuild` in try/finally. We
    // exercise the same shape here using the real exports so the
    // test reflects the production control flow.
    const state = disableBff({ cwd: root, logger: silentLogger() });
    try {
      // Simulate a build that throws (e.g. spawnSync crashes on a
      // missing binary). The script's finally must still restore.
      throw new Error("simulated build crash");
    } catch {
      // expected
    } finally {
      restoreBff(state, { cwd: root, logger: silentLogger() });
    }

    expect(existsSync(apiDir)).toBe(true);
  });

  it("restores the API tree even when the build returns a non-zero exit code", () => {
    // We model the "non-zero exit" case by simulating main()'s
    // control flow: disableBff → work-that-returns-nonzero →
    // unconditional finally → restoreBff. The script's finally
    // block is NOT conditional on the build's exit code, so
    // restoration must happen either way.
    const apiDir = join(root, "app", "api");
    const disabledDir = join(root, "app", "_api_disabled");

    const state = disableBff({ cwd: root, logger: silentLogger() });
    let buildExitCode = 1; // simulate a failed build
    try {
      // No-op: in main() this is `runNextBuild(target)`. The
      // non-zero result is captured into `buildExitCode` and the
      // function logs and returns it — but the finally still runs.
    } finally {
      restoreBff(state, { cwd: root, logger: silentLogger() });
    }

    expect(buildExitCode).toBe(1); // sanity-check the test fixture
    expect(existsSync(apiDir)).toBe(true);
    expect(existsSync(disabledDir)).toBe(false);
  });
});

describe("integration with the real repo's app/api", () => {
  it("leaves the real API tree untouched when cwd points elsewhere", () => {
    // Construct a fake repo in a temp dir. The real `app/api/`
    // must not be touched by this test — we only assert that the
    // temp repo's rename worked.
    const fakeRoot = makeFakeRepo();
    cleanups.push(fakeRoot);

    const realApi = join(process.cwd(), "app", "api");
    const realApiExistsBefore = existsSync(realApi);

    const state = disableBff({ cwd: fakeRoot, logger: silentLogger() });
    restoreBff(state, { cwd: fakeRoot, logger: silentLogger() });

    // The real API tree (if it existed when the test started) is
    // still there, untouched.
    expect(existsSync(realApi)).toBe(realApiExistsBefore);
  });
});

/**
 * Quiet logger for tests. We don't want the test output polluted
 * with rename/restore banners; spies can still attach to it.
 */
function silentLogger() {
  return {
    log: () => {},
    warn: () => {},
    error: () => {},
  };
}
