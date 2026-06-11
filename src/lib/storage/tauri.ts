/**
 * Tauri desktop implementation of the storage layer.
 *
 * Uses tauri-plugin-store (async); v1.0 caches reads in memory for sync
 * API compatibility with Zustand's createJSONStorage contract. Web reads
 * are synchronous; on Tauri the real Store API is async. We expose a
 * sync surface by keeping an in-memory cache and fire-and-forgetting
 * writes to the plugin once the M3.8 integration lands.
 *
 * NOTE: M3.4 ships the in-memory cache. Real plugin calls land in M3.8.
 * Until then, persisted state does not survive a Tauri app restart.
 */

const cache = new Map<string, string>();

export function getItem(key: string): string | null {
  return cache.get(key) ?? null;
}

export function setItem(key: string, value: string): void {
  cache.set(key, value);
  // M3.8 will add the real `Store.set()` call here as fire-and-forget
}

export function removeItem(key: string): void {
  cache.delete(key);
  // M3.8 will add the real `Store.delete()` call here as fire-and-forget
}

export const isAsync = false;
