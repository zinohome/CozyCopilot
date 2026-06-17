/**
 * Capacitor mobile implementation of the notification layer.
 *
 * Capacitor 7.x surfaces OS-level notifications on iOS and Android
 * through `@capacitor/local-notifications`. The plugin schedule is
 * fire-and-forget; the permission flow is async.
 *
 * The runtime is detected via the `window.Capacitor` global injected
 * by the native bridge. SSR / pure-web environments fall through to
 * "unsupported" / no-op so the dispatcher in index.ts can call through
 * safely regardless of the surface.
 *
 * `getPermission` returns "default" when the runtime is present
 * because LocalNotifications does not expose a sync permission
 * check; consumers should treat this as "unknown — call
 * requestPermission() to learn". A future iteration can persist the
 * last-seen permission in storage (see M3.4 / storage impl) and read
 * it back synchronously.
 */
import { LocalNotifications } from "@capacitor/local-notifications";

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
 * otherwise (LocalNotifications.checkPermissions() is async and the
 * sync surface is the contract; v1.0 callers invoke requestPermission()
 * to learn the real state).
 */
export function getPermission(): CapacitorNotificationPermission {
  if (typeof window === "undefined" || !window.Capacitor) return "unsupported";
  return "default";
}

/**
 * Triggers the OS-level notification permission prompt via the
 * Capacitor LocalNotifications plugin. The plugin reports the post-
 * prompt state in `result.display`; we map it onto the abstraction's
 * permission union.
 */
export async function requestPermission(): Promise<CapacitorNotificationPermission> {
  if (typeof window === "undefined" || !window.Capacitor) return "unsupported";
  const result = await LocalNotifications.requestPermissions();
  if (result.display === "granted") return "granted";
  if (result.display === "denied") return "denied";
  return "default";
}

/**
 * Schedules a local notification via LocalNotifications.schedule. A
 * unique numeric ID is required (we derive one from `Date.now()` when
 * the caller did not supply one). The `schedule.at` is set 100 ms in
 * the future to mimic an immediate display — the plugin requires a
 * scheduled time, not a "now" sentinel.
 */
export function notify(opts: NotifyOptions): void {
  if (typeof window === "undefined" || !window.Capacitor) return;
  if (opts.id === undefined) opts.id = Date.now();
  void LocalNotifications.schedule({
    notifications: [
      {
        id: opts.id,
        title: opts.title,
        body: opts.body ?? "",
        schedule: { at: new Date(Date.now() + 100) },
      },
    ],
  });
}
