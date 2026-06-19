"use client";

import { useThemeStore } from "@/stores/theme";

/**
 * Dark/light mode toggle. A single button that flips the `mode` slice of
 * the theme store between `"light"` and `"dark"`. The DOM effect in the
 * root layout reads the new value and updates `<html data-mode>` so the
 * dark-mode CSS files under `src/styles/dark/*.css` take over.
 *
 * Visual: a Sun glyph when the current mode is dark (action: switch to
 * light), a Moon glyph when the current mode is light (action: switch
 * to dark). Uses inline SVG so we don't introduce an icon dependency
 * (the existing app uses unicode glyphs for similar small affordances).
 */
export function ThemeToggle(): React.ReactElement {
  const mode = useThemeStore((s) => s.mode);
  const toggleMode = useThemeStore((s) => s.toggleMode);
  const isDark = mode === "dark";

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-pressed={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "切换到浅色" : "切换到深色"}
      data-testid="theme-toggle"
      className={
        "inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius)] border border-border bg-bg text-fg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      }
    >
      {isDark ? (
        // Sun — visible in dark mode, click to switch to light.
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m4.93 19.07 1.41-1.41" />
          <path d="m17.66 6.34 1.41-1.41" />
        </svg>
      ) : (
        // Moon — visible in light mode, click to switch to dark.
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
