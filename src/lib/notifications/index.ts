/**
 * Unified notification API. Business code imports from here only.
 *
 * The implementation is selected once at module-load time based on
 * platform globals injected by the Tauri and Capacitor runtimes. SSR
 * falls back to the web implementation (no-op on the server).
 */
import * as web from "./web";
import * as tauri from "./tauri";
import * as capacitor from "./capacitor";

export type NotifyOptions =
  | web.NotifyOptions
  | tauri.NotifyOptions
  | capacitor.NotifyOptions;

export type NotificationPermission =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

declare global {
  // Tauri 2.x injects this at runtime; not present in jsdom or web
  var __TAURI_INTERNALS__: unknown;

  interface Window {
    Capacitor?: { getPlatform: () => string };
  }
}

function selectImpl() {
  if (typeof window === "undefined") {
    // SSR: fall back to web (no-op on the server)
    return web;
  }
  if (typeof window.__TAURI_INTERNALS__ !== "undefined") return tauri;
  if (typeof window.Capacitor !== "undefined") return capacitor;
  return web;
}

const impl = selectImpl();

export const requestPermission: () => Promise<NotificationPermission> =
  impl.requestPermission;
export const getPermission: () => NotificationPermission = impl.getPermission;
export const notify: (opts: NotifyOptions) => void = impl.notify;

// Re-export for tests and advanced consumers
export { web, tauri, capacitor };
