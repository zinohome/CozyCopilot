#!/usr/bin/env node
/**
 * scripts/build-mobile.mjs
 *
 * Capacitor 7.x mobile build. Steps:
 *   1. Build the static Next.js bundle to `out/` (currently broken —
 *      see scripts/build-static.mjs and BUILD.md). Capacitor picks the
 *      bundle up via `webDir: "out"` in `capacitor.config.ts` and copies
 *      it into `ios/App/App/public` and `android/app/src/main/assets/public`
 *      on `npx cap sync`.
 *   2. Run `npx cap sync` to copy `out/` into the native iOS / Android
 *      projects. This step itself works in CI today, but it produces
 *      nothing useful without a populated `out/`.
 *
 * After this script finishes successfully, the developer still needs
 * to open the native IDE (`npx cap open ios` / `npx cap open android`)
 * to produce the signed `.ipa` / `.apk` — that step is out of scope
 * for the M3 build matrix and is documented in BUILD.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

console.log("[build-mobile] Step 1/2: build static bundle (desktop target)…");
const staticBuild = spawnSync("node", ["scripts/build-static.mjs"], { stdio: "inherit" });
if (staticBuild.status !== 0) {
  console.error("[build-mobile] Static build failed. Aborting before cap sync.");
  console.error("[build-mobile] See BUILD.md for the M6 plan that fixes the static export.");
  process.exit(staticBuild.status ?? 1);
}

if (!existsSync("out")) {
  console.error("[build-mobile] Expected out/ after static build but it was not found.");
  process.exit(1);
}

console.log("[build-mobile] Step 2/2: run npx cap sync…");
console.log("[build-mobile] NOTE: producing a signed .ipa / .apk requires Xcode / Android Studio.");
const capSync = spawnSync("npx", ["cap", "sync"], { stdio: "inherit" });
process.exit(capSync.status ?? 1);
