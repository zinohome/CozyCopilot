/**
 * Theme + mode store.
 *
 * Persists user choice to localStorage under `cozy-theme`. SSR-safe: when
 * `window` is undefined the initial state falls back to the defaults and
 * the persist middleware no-ops until hydration completes on the client.
 *
 * The store is the single source of truth for which palette the app shows.
 * The DOM effect (`applyThemeToDom`) reads from it on mount and on every
 * change, setting `<html data-theme="..." data-mode="...">` so the
 * attribute-scoped CSS in `src/styles/themes/*.css` resolves the right
 * RGB triplets.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { THEME_NAMES, MODE_NAMES, type ThemeName, type ThemeMode } from "@/styles/themes.data";

export type { ThemeName, ThemeMode };

export interface ThemeState {
  theme: ThemeName;
  mode: ThemeMode;
  setTheme: (theme: ThemeName) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

/**
 * Validate a stored value against the registries in `themes.data.ts`.
 * Falls back to defaults when the stored value is missing or invalid —
 * protects against stale localStorage payloads from a previous version.
 */
function safeTheme(value: unknown): ThemeName {
  return (THEME_NAMES as readonly string[]).includes(value as string)
    ? (value as ThemeName)
    : "cozy-orange";
}

function safeMode(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : "light";
}

const DEFAULT_THEME: ThemeName = "cozy-orange";
const DEFAULT_MODE: ThemeMode = "light";

/**
 * Storage factory that is SSR-safe: returns a no-op storage when
 * `localStorage` is not present. Zustand's `persist` middleware tolerates
 * this — it falls back to in-memory state until the client hydrates.
 */
function makeStorage() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
  }
  return window.localStorage;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,
      mode: DEFAULT_MODE,
      setTheme: (theme) => {
        if ((THEME_NAMES as readonly string[]).includes(theme)) {
          set({ theme });
        }
      },
      setMode: (mode) => {
        if ((MODE_NAMES as readonly string[]).includes(mode)) {
          set({ mode });
        }
      },
      toggleMode: () => {
        const current = get().mode;
        set({ mode: current === "dark" ? "light" : "dark" });
      },
    }),
    {
      name: "cozy-theme",
      storage: createJSONStorage(() => makeStorage()),
      // Validate on rehydrate so an old/garbage payload doesn't crash.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.theme = safeTheme(state.theme);
        state.mode = safeMode(state.mode);
      },
    },
  ),
);

/**
 * Imperative, non-React accessor. Useful in non-component code (the
 * blocking inline script in `app/layout.tsx`, for example) where a hook
 * is not available.
 */
export function getStoredTheme(): { theme: ThemeName; mode: ThemeMode } | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem("cozy-theme");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { theme?: unknown; mode?: unknown } };
    const state = parsed?.state;
    if (!state) return null;
    return { theme: safeTheme(state.theme), mode: safeMode(state.mode) };
  } catch {
    return null;
  }
}
