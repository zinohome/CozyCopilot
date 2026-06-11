/**
 * Capacitor mobile implementation of the capability layer.
 *
 * Uses Capacitor's Permissions plugin for microphone on iOS/Android.
 *
 * NOTE: M3.1+M3.2 ship the type definitions and the index.ts dispatch
 * logic. The actual @capacitor/core and @capacitor/permissions imports
 * will be added in M3.9 when those packages are installed via
 * `npx cap add ios && npx cap add android`. Until then we detect the
 * Capacitor runtime via the window.Capacitor global injected by the
 * native bridge, and return safe "prompt"/false defaults so business
 * code can ship without crashing.
 */

// @capacitor/core and @capacitor/permissions are installed in M3.9.
// Until then, we use a local type stub to keep the file self-contained.

type CapacitorGlobal = { getPlatform: () => string };

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

export type PermissionState = "granted" | "denied" | "prompt";

/**
 * Reports the current microphone permission state via the Capacitor
 * Permissions plugin. Returns "prompt" on SSR or when the Capacitor
 * runtime global is absent.
 */
export async function checkMicrophonePermission(): Promise<PermissionState> {
  if (typeof window === "undefined" || !window.Capacitor) return "prompt";
  // M3.9 will replace this with the real Permissions.query() call
  return "prompt";
}

/**
 * Requests microphone permission via the Capacitor Permissions plugin.
 * Returns true only when the user explicitly grants access; the v1.0
 * stub returns false until M3.9 lands the real plugin call.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (typeof window === "undefined" || !window.Capacitor) return false;
  // M3.9 will replace this with the real Permissions.request() call
  return false;
}

export const isNativeApp = true;

export type CapacitorPlatform = "ios" | "android";

/**
 * Asks the Capacitor runtime which platform the bundle is running on.
 * Falls back to "ios" on SSR and when the runtime global is absent.
 */
export function getPlatform(): CapacitorPlatform {
  if (typeof window === "undefined" || !window.Capacitor) return "ios";
  return (window.Capacitor.getPlatform() as CapacitorPlatform) ?? "ios";
}
