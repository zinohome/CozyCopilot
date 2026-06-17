/**
 * Tauri desktop implementation of the storage layer.
 *
 * Uses @tauri-apps/plugin-store (async) — the Rust side of the plugin
 * is registered in src-tauri/src/lib.rs and the JS-side store plugin
 * is exposed via `@tauri-apps/plugin-store`. v1.0 keeps an in-memory
 * cache so the exposed surface can match Zustand's
 * `createJSONStorage` contract (which expects a synchronous Storage);
 * writes are applied to the cache immediately and the real plugin
 * write is fired fire-and-forget. This is a v1.0 simplification —
 * durable persistence on Tauri is best-effort within a single session.
 */
import { LazyStore } from "@tauri-apps/plugin-store";

/**
 * Detect a real Tauri runtime. The test suite stubs
 * `globalThis.__TAURI_INTERNALS__ = {}`, which is not enough to mark
 * the runtime as live — we also need a real `invoke` function, which
 * the Rust side injects at startup. When that is present, the plugin
 * calls go through; otherwise we no-op.
 */
function isLiveTauri(): boolean {
  if (typeof window === "undefined") return false;
  const internals = (window as { __TAURI_INTERNALS__?: { invoke?: unknown } })
    .__TAURI_INTERNALS__;
  return Boolean(internals && typeof internals.invoke === "function");
}

const store = new LazyStore("settings.json");
const cache = new Map<string, string>();

export function getItem(key: string): string | null {
  return cache.get(key) ?? null;
}

export function setItem(key: string, value: string): void {
  cache.set(key, value);
  if (!isLiveTauri()) return;
  // Fire-and-forget: real plugin write happens in the background.
  void store.set(key, value).then(() => store.save());
}

export function removeItem(key: string): void {
  cache.delete(key);
  if (!isLiveTauri()) return;
  void store.delete(key).then(() => store.save());
}

export const isAsync = false;
