#!/usr/bin/env node
/**
 * scripts/build-embed.mjs
 *
 * Embed widget build. Produces a static HTML/JS bundle under `out/`
 * (with `trailingSlash: true` and `frame-ancestors *` CSP) that can be
 * loaded inside a third-party iframe at the path of the host's choice.
 *
 * Step 1: run the static Next.js build via `scripts/build-static.mjs`
 *         with the `embed` target so the resulting CSP is iframe-friendly.
 *         (Currently broken pending the M6 BFF refactor — see BUILD.md.)
 *
 * The script propagates the static build's exit code; when the M6 fix
 * lands it will additionally run any embed-specific post-processing
 * (e.g. inlining a tiny loader.js per the embed widget contract).
 */
import { spawnSync } from "node:child_process";

console.log("[build-embed] Step 1/1: build static bundle (embed target)…");
const staticBuild = spawnSync("node", ["scripts/build-static.mjs", "--embed"], {
  stdio: "inherit",
});
process.exit(staticBuild.status ?? 1);
