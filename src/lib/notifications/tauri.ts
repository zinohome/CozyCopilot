/**
 * Tauri desktop implementation of the notification layer.
 *
 * Tauri 2.x uses `@tauri-apps/plugin-notification` to surface OS-level
 * notifications on macOS / Windows / Linux. The package will be
 * installed in M3.8 when the Tauri shell scaffolding lands.
 *
 * NOTE: M3.3 ships the type definitions and the index.ts dispatch logic.
 * The real plugin imports land in M3.8. Until then we detect the
 * Tauri runtime via the window.__TAURI_INTERNALS__ global injected by
 * the native bridge, and return safe "default" / no-op defaults so
 * business code can ship without crashing.
 */

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
 * Returns the current notification permission state. "unsupported" on
 * SSR and when the Tauri runtime global is absent; "default" otherwise
 * (M3.8 will report the real isPermissionGranted() result).
 */
export function getPermission(): TauriNotificationPermission {
  if (typeof window === "undefined") return "unsupported";
  if (typeof window.__TAURI_INTERNALS__ === "undefined") return "unsupported";
  // M3.8 will replace this with the real `isPermissionGranted()` call
  return "default";
}

/**
 * Triggers the OS-level notification permission prompt via the Tauri
 * notification plugin. M3.8 will wire up the real
 * `requestPermission()` call; for M3.3 we return "default" when the
 * runtime is present.
 */
export async function requestPermission(): Promise<TauriNotificationPermission> {
  if (typeof window === "undefined") return "unsupported";
  if (typeof window.__TAURI_INTERNALS__ === "undefined") return "unsupported";
  // M3.8 will replace this with the real `requestPermission()` call
  return "default";
}

/**
 * Shows a desktop notification. M3.8 will wire up the real
 * `sendNotification()` call. M3.3 no-ops once the runtime is
 * detected, so the dispatcher can call through safely.
 */
export function notify(opts: NotifyOptions): void {
  if (typeof window === "undefined") return;
  if (typeof window.__TAURI_INTERNALS__ === "undefined") return;
  // M3.8 will replace this with the real `sendNotification()` call
  void opts;
}
