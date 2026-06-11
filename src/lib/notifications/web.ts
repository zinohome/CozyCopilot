/**
 * Web implementation of the notification layer.
 * Uses the browser Notification API.
 *
 * Used in browser and embed widget surfaces, and as the SSR fallback
 * (no-ops on the server). Has no platform dependencies.
 */

export type NotifyOptions = {
  title: string;
  body?: string;
  icon?: string;
  /** Dedup key: if a notification with this tag is already showing, replace it. */
  tag?: string;
};

export type WebNotificationPermission =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

/**
 * Returns the current notification permission state, or "unsupported"
 * when the browser Notification API is absent (SSR, older browsers).
 */
export function getPermission(): WebNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as WebNotificationPermission;
}

/**
 * Triggers the OS-level notification permission prompt when the current
 * state is "default". Returns the resulting permission (or "unsupported"
 * when the API is absent). Already-resolved states are short-circuited.
 */
export async function requestPermission(): Promise<WebNotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result as WebNotificationPermission;
}

/**
 * Shows a notification. No-op on SSR, when the API is absent, or when
 * permission is not "granted" — the caller is expected to check
 * getPermission() / requestPermission() first.
 */
export function notify(opts: NotifyOptions): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(opts.title, {
    body: opts.body,
    icon: opts.icon,
    tag: opts.tag,
  });
}
