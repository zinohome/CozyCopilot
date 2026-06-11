/**
 * Web implementation of the storage layer.
 *
 * Thin wrapper over localStorage (synchronous). Used in the browser,
 * the embed widget, and as the SSR fallback for the Tauri/Capacitor
 * impls (which need window to detect the runtime).
 */

export function getItem(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    // localStorage may throw in private mode, sandboxed iframes, etc.
    return null;
  }
}

export function setItem(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota exceeded; ignore */
  }
}

export function removeItem(key: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const isAsync = false;
