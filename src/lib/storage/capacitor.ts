/**
 * Capacitor mobile implementation of the storage layer.
 *
 * Uses @capacitor/preferences (async) backed by UserDefaults (iOS) /
 * SharedPreferences (Android). The async API is hidden behind a
 * module-scoped in-memory cache so the call sites stay sync — this
 * matches Zustand's `createJSONStorage` contract and the M3.4
 * abstraction.
 *
 * Trade-off (M3.4 decision): cache is the source of truth for the
 * session; real plugin calls are fire-and-forget. Durable persistence
 * is best-effort: a synchronous getItem at the very start of a session
 * (before the first setItem) returns `null` even if a value was
 * previously written, because Preferences.get is async and we cannot
 * await it from this sync API. A future iteration can switch to
 * `createJSONStorage(getItem, setItem)` with an async storage adapter.
 */
import { Preferences } from "@capacitor/preferences";

const cache = new Map<string, string>();

export function getItem(key: string): string | null {
  return cache.get(key) ?? null;
}

export function setItem(key: string, value: string): void {
  cache.set(key, value);
  // Fire-and-forget write to the native backing store. We intentionally
  // do not await — the sync surface is the contract; durability is
  // best-effort within a session (see M3.4 design decision).
  void Preferences.set({ key, value });
}

export function removeItem(key: string): void {
  cache.delete(key);
  void Preferences.remove({ key });
}

export const isAsync = false;
