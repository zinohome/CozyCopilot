#!/usr/bin/env node
/**
 * scripts/build-desktop.mjs
 *
 * Tauri 2.x desktop build. Steps:
 *   1. Build the static Next.js bundle to `out/` (currently broken —
 *      see scripts/build-static.mjs and BUILD.md). Tauri picks the
 *      bundle up via `frontendDist: "../out"` in `src-tauri/tauri.conf.json`.
 *   2. Run `cargo tauri build` from `src-tauri/` to produce the native
 *      bundle (`.app` on macOS, `.msi` on Windows, `.deb`/`.AppImage`
 *      on Linux). Requires the Rust toolchain — see https://rustup.rs.
 *
 * The script bails on the first failed step so CI does not waste time
 * producing a Tauri bundle against a stale `out/`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

console.log("[build-desktop] Step 1/2: build static bundle (desktop target)…");
const staticBuild = spawnSync("node", ["scripts/build-static.mjs"], { stdio: "inherit" });
if (staticBuild.status !== 0) {
  console.error("[build-desktop] Static build failed. Aborting before cargo tauri build.");
  console.error("[build-desktop] See BUILD.md for the M6 plan that fixes the static export.");
  process.exit(staticBuild.status ?? 1);
}

// Defensive: `out/` should now exist. Bail loudly if it doesn't, since
// `cargo tauri build` would otherwise fail with a less obvious error.
if (!existsSync("out")) {
  console.error("[build-desktop] Expected out/ after static build but it was not found.");
  process.exit(1);
}

console.log("[build-desktop] Step 2/2: run cargo tauri build…");
console.log("[build-desktop] NOTE: requires the Rust toolchain (https://rustup.rs).");

// Use the tauri CLI as installed in src-tauri/.cargo/bin or on $PATH.
// `cargo tauri build` is the standard incantation; fall back to
// `pnpm exec tauri build` if `cargo` is not on PATH but the JS shim is.
const cargoAvailable = spawnSync("cargo", ["--version"], { stdio: "ignore" }).status === 0;
const tauriBuild = cargoAvailable
  ? spawnSync("cargo", ["tauri", "build"], { stdio: "inherit", cwd: "src-tauri" })
  : spawnSync("pnpm", ["exec", "tauri", "build"], { stdio: "inherit", cwd: "src-tauri" });

process.exit(tauriBuild.status ?? 1);
