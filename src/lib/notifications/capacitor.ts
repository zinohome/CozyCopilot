/**
 * Capacitor mobile implementation of the notification layer.
 *
 * Capacitor 7.x uses `@capacitor/local-notifications` to surface
 * OS-level notifications on iOS and Android. The package will be
 * installed in M3.9 when the mobile shells are added.
 *
 * NOTE: M3.3 ships the type definitions and the index.ts dispatch
 * logic. The real plugin imports land in M3.9. Until then we detect
 * the Capacitor runtime via the window.Capacitor global injected by
 * the native bridge, and return safe "default" / no-op defaults so
 * business code can ship without crashing.
 */

export type NotifyOptions = {
  title: string;
  body?: string;
  /** Capacitor requires a numeric ID to dedup / replace scheduled notifications. */
  id?: number;
};

export type CapacitorNotificationPermission =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

type CapacitorGlobal = { getPlatform: () => string };

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

/**
 * Returns the current notification permission state. "unsupported" on
 * SSR and when the Capacitor runtime global is absent; "default"
 * otherwise (M3.9 will report the real LocalNotifications.checkPermissions()
 * result).
 */
export function getPermission(): CapacitorNotificationPermission {
  if (typeof window === "undefined" || !window.Capacitor) return "unsupported";
  // M3.9 will replace this with the real `LocalNotifications.checkPermissions()` call
  return "default";
}

/**
 * Triggers the OS-level notification permission prompt via the
 * Capacitor LocalNotifications plugin. M3.9 will wire up the real
 * `LocalNotifications.requestPermissions()` call.
 */
export async function requestPermission(): Promise<CapacitorNotificationPermission> {
  if (typeof window === "undefined" || !window.Capacitor) return "unsupported";
  // M3.9 will replace this with the real `LocalNotifications.requestPermissions()` call
  return "default";
}

/**
 * Schedules a local notification. M3.9 will wire up the real
 * `LocalNotifications.schedule()` call. M3.3 no-ops once the runtime
 * is detected, so the dispatcher can call through safely.
 */
export function notify(opts: NotifyOptions): void {
  if (typeof window === "undefined" || !window.Capacitor) return;
  // M3.9 will replace this with the real `LocalNotifications.schedule()` call
  void opts;
}
