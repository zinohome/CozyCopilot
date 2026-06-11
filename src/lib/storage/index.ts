/**
 * Unified storage API. Business code imports from here only.
 *
 * The implementation is selected once at module-load time based on
 * platform globals injected by the Tauri and Capacitor runtimes. SSR
 * falls back to the web implementation (no-op for getItem; setItem
 * silently drops the value because localStorage is absent).
 *
 * The exposed surface is synchronous to match Zustand's
 * `createJSONStorage` contract, which expects a Storage with
 * getItem/setItem/removeItem returning `string | null` / `void`.
 *
 * Tauri/Capacitor both back async plugin APIs; to keep the sync surface
 * they cache values in memory after the first read, and writes are
 * applied to the cache immediately with the real plugin call fired
 * fire-and-forget. This is a v1.0 simplification — durable persistence
 * on native is best-effort within a single session.
 */
import * as web from "./web";
import * as tauri from "./tauri";
import * as capacitor from "./capacitor";

declare global {
  // Tauri 2.x injects this at runtime; not present in jsdom or web
  var __TAURI_INTERNALS__: unknown;

  interface Window {
    Capacitor?: { getPlatform: () => string };
  }
}

function selectImpl() {
  if (typeof window === "undefined") {
    // SSR: fall back to web (localStorage is undefined; reads return null)
    return web;
  }
  if (typeof window.__TAURI_INTERNALS__ !== "undefined") return tauri;
  if (typeof window.Capacitor !== "undefined") return capacitor;
  return web;
}

const impl = selectImpl();

export const getItem: (key: string) => string | null = impl.getItem;
export const setItem: (key: string, value: string) => void = impl.setItem;
export const removeItem: (key: string) => void = impl.removeItem;
export const isAsync: boolean = impl.isAsync;

// Re-export for tests and advanced consumers
export { web, tauri, capacitor };

/**
 * Adapter for Zustand's createJSONStorage — wraps our async-capable impl
 * in a sync Storage interface. Use this from `src/stores/*` to keep the
 * store definition platform-agnostic.
 */
export function makeZustandStorage(): Storage {
  // Zustand only calls getItem/setItem/removeItem; the rest of the DOM
  // Storage surface is supplied as a no-op shim so the type fits.
  return {
    getItem: (key: string) => getItem(key),
    setItem: (key: string, value: string) => setItem(key, value),
    removeItem: (key: string) => removeItem(key),
    clear: () => {
      // Storage is opaque from this layer; consumers wanting clear
      // semantics should call removeItem for each known key.
    },
    key: (_index: number) => null,
    length: 0,
  };
}
