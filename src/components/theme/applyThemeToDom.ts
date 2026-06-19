/**
 * DOM-side effect that syncs the active theme + mode to `<html>`.
 *
 * The CSS files under `src/styles/themes/*.css` and `src/styles/dark/*.css`
 * use `:root[data-theme="X"]` / `:root[data-theme="X"][data-mode="dark"]`
 * selectors, so setting those two attributes is the only DOM work needed
 * to swap the entire palette.
 *
 * This module is SSR-safe: when `document` is undefined (e.g. during
 * server rendering) the function returns a no-op cleanup. The matching
 * blocking inline script in `app/layout.tsx` handles the SSR paint
 * separately.
 */
import type { ThemeName, ThemeMode } from "@/stores/theme";

export function applyThemeToDom(theme: ThemeName, mode: ThemeMode): () => void {
  if (typeof document === "undefined") {
    return () => {
      /* SSR no-op */
    };
  }
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-mode", mode);
  return () => {
    // Tests use this cleanup to verify the effect is reversible. In
    // production the effect runs once on mount and cleanup runs on
    // unmount — by then the next applyThemeToDom() has already installed
    // the new values, so removing both attributes is the right reset.
    root.removeAttribute("data-theme");
    root.removeAttribute("data-mode");
  };
}
