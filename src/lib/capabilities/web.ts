/**
 * Web implementation of the capability layer.
 *
 * Used in browser, embed widget, and as the SSR fallback. Has no platform
 * dependencies — relies only on standard browser APIs (navigator.permissions
 * and navigator.mediaDevices).
 */

export type PermissionState = "granted" | "denied" | "prompt";

/**
 * Queries the current microphone permission state via the Permissions API.
 * Returns "prompt" when the browser does not expose the API (SSR, older
 * Safari) so the UI can decide to request a fresh prompt.
 */
export async function checkMicrophonePermission(): Promise<PermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions) {
    return "prompt";
  }
  try {
    // The "microphone" permission name is non-standard; cast for cross-browser compat
    const result = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return result.state as PermissionState;
  } catch {
    // Some browsers (Safari) don't support permissions.query for microphone
    return "prompt";
  }
}

/**
 * Triggers the OS-level microphone prompt by calling getUserMedia, then
 * immediately releases the stream. Returns true when the user grants access
 * and false on denial, error, or absence of mediaDevices.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop tracks immediately — we only needed to trigger the prompt
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

export const isNativeApp = false;

export type WebPlatform = "web" | "embed";

/**
 * Detects whether the bundle is running inside a cross-origin embed iframe
 * (the embed widget surface) vs a top-level browser tab (the own-hosted
 * web surface). Cross-origin frame access throws, which we treat as embed.
 */
export function getPlatform(): WebPlatform {
  if (typeof window === "undefined") return "web";
  // Embed widget runs inside a cross-origin iframe
  try {
    if (window.self !== window.top) return "embed";
  } catch {
    // Cross-origin iframe throws on window.top access; treat as embed
    return "embed";
  }
  return "web";
}
