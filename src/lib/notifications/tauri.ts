/**
 * Tauri desktop implementation of the notification layer.
 *
 * Tauri 2.x uses `@tauri-apps/plugin-notification` to surface OS-level
 * notifications on macOS / Windows / Linux. The Rust side of the plugin
 * is registered in src-tauri/src/lib.rs; the JS-side package is installed
 * and exposed via `@tauri-apps/plugin-notification`.
 *
 * The `getPermission()` getter is kept synchronous to match the surface
 * used by the index.ts dispatcher and downstream consumers (the v1.0
 * contract is "default" until proven "granted" or "denied"). The
 * real `isPermissionGranted()` check runs in `requestPermission()`,
 * which is the only path that needs to be async.
 *
 * `notify()` is a synchronous wrapper that calls the real
 * `sendNotification()` (also synchronous in the plugin API). When the
 * Tauri runtime is absent (jsdom, SSR, plain web), every function
 * falls back to a safe no-op / "unsupported" return so the dispatcher
 * can call through without crashing.
 */

import {
  isPermissionGranted,
  requestPermission as tauriRequestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export type NotifyOptions = {
  title: string;
  body?: string;
  tag?: string;
};

export type TauriNotificationPermission =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

/**
 * Detect a real Tauri runtime. The test suite stubs
 * `globalThis.__TAURI_INTERNALS__ = {}`, which is not enough to mark
 * the runtime as live — we also need a real `invoke` function, which
 * the Rust side injects at startup. When that is present, the plugin
 * calls go through; otherwise we no-op.
 */
function isLiveTauri(): boolean {
  if (typeof window === "undefined") return false;
  const internals = (window as { __TAURI_INTERNALS__?: { invoke?: unknown } })
    .__TAURI_INTERNALS__;
  return Boolean(internals && typeof internals.invoke === "function");
}

/**
 * Returns the current notification permission state. "unsupported" on
 * SSR and when the Tauri runtime global is absent; "default" when the
 * runtime is present (we don't await the real `isPermissionGranted()`
 * here to keep this getter synchronous — use `requestPermission()` to
 * force a real check).
 */
export function getPermission(): TauriNotificationPermission {
  if (typeof window === "undefined") return "unsupported";
  if (typeof window.__TAURI_INTERNALS__ === "undefined") return "unsupported";
  return "default";
}

/**
 * Triggers the OS-level notification permission prompt via the Tauri
 * notification plugin. Calls the real `isPermissionGranted()` first
 * to short-circuit a granted state, otherwise invokes
 * `requestPermission()`. Returns "unsupported" outside a live Tauri
 * runtime so the dispatcher can fall through cleanly.
 */
export async function requestPermission(): Promise<TauriNotificationPermission> {
  if (!isLiveTauri()) return "unsupported";
  try {
    if (await isPermissionGranted()) return "granted";
    const result = await tauriRequestPermission();
    return (result as TauriNotificationPermission) ?? "default";
  } catch {
    return "default";
  }
}

/**
 * Shows a desktop notification via `sendNotification()`. No-ops when
 * the Tauri runtime is absent. Permission is checked lazily — the
 * plugin will silently drop the call if the OS denies it.
 */
export function notify(opts: NotifyOptions): void {
  if (!isLiveTauri()) return;
  try {
    sendNotification({ title: opts.title, body: opts.body });
  } catch {
    /* plugin may throw if the runtime is mid-tear-down; ignore */
  }
}
