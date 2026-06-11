/**
 * Capacitor mobile implementation of the storage layer.
 *
 * Uses @capacitor/preferences (async); v1.0 caches reads in memory for
 * sync API compatibility with Zustand's createJSONStorage contract.
 *
 * NOTE: M3.4 ships the in-memory cache. Real plugin calls land in M3.9.
 * Until then, persisted state does not survive a Capacitor app restart.
 */

const cache = new Map<string, string>();

export function getItem(key: string): string | null {
  return cache.get(key) ?? null;
}

export function setItem(key: string, value: string): void {
  cache.set(key, value);
  // M3.9 will add the real `Preferences.set()` call here as fire-and-forget
}

export function removeItem(key: string): void {
  cache.delete(key);
  // M3.9 will add the real `Preferences.delete()` call here as fire-and-forget
}

export const isAsync = false;
