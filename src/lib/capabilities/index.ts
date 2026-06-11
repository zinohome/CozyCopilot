/**
 * Unified capability API. Business code imports from here only.
 *
 * The implementation is selected once at module-load time based on
 * platform globals injected by the Tauri and Capacitor runtimes. SSR
 * falls back to the web implementation (no-op for getUserMedia;
 * checkMicrophonePermission returns "prompt").
 */
import * as web from "./web";
import * as tauri from "./tauri";
import * as capacitor from "./capacitor";

export type PermissionState = "granted" | "denied" | "prompt";

declare global {
  // Tauri 2.x injects this at runtime; not present in jsdom or web
  var __TAURI_INTERNALS__: unknown;
}

function selectImpl() {
  if (typeof window === "undefined") {
    // SSR: fall back to web (no-op for getUserMedia; checkMicrophonePermission returns "prompt")
    return web;
  }
  if (typeof window.__TAURI_INTERNALS__ !== "undefined") return tauri;
  if (typeof window.Capacitor !== "undefined") return capacitor;
  return web;
}

const impl = selectImpl();

export const checkMicrophonePermission: () => Promise<PermissionState> =
  impl.checkMicrophonePermission;
export const requestMicrophonePermission: () => Promise<boolean> =
  impl.requestMicrophonePermission;
export const isNativeApp: boolean = impl.isNativeApp;
export const getPlatform: () => string = impl.getPlatform;

// Re-export for tests and advanced consumers
export { web, tauri, capacitor };
