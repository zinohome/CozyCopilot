"use client";

import { useEffect, useRef, useState } from "react";
import { useThemeStore, type ThemeName } from "@/stores/theme";
import { THEME_NAMES, THEME_PRESETS } from "@/styles/themes.data";
import { cn } from "@/lib/utils";

/** Human-friendly labels for each preset. */
const THEME_LABELS: Record<ThemeName, string> = {
  "cozy-orange": "Cozy Orange",
  "calm-blue": "Calm Blue",
  mint: "Mint",
  lavender: "Lavender",
  mono: "Mono",
};

/**
 * Theme picker — a button trigger showing the current preset's swatch
 * + name, opens a popover listing all five presets as clickable swatches.
 *
 * Each swatch is a small color preview rendered from the preset's light
 * `accent` RGB triplet. The currently active preset gets a ring + an
 * `aria-current="true"` attribute for assistive tech.
 *
 * The popover closes on outside-click and on Escape; both are wired
 * imperatively to keep the implementation light (no portal/radix).
 */
export function ThemePicker(): React.ReactElement {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstSwatchRef = useRef<HTMLButtonElement | null>(null);

  // Outside click closes the popover. jsdom doesn't dispatch the
  // pointerdown reliably, so we use mousedown which fires on the
  // userEvent `click` path.
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      const root = containerRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        // Restore focus to the trigger so keyboard users land somewhere
        // sensible after dismissing the popover.
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // M7.5: when the popover opens, move focus to the first swatch so
  // keyboard users can arrow/tab through the presets without first
  // tabbing past the trigger they just activated.
  useEffect(() => {
    if (open) {
      firstSwatchRef.current?.focus();
    }
  }, [open]);

  const currentSwatch = `rgb(${THEME_PRESETS[theme].light.accent})`;
  const currentLabel = THEME_LABELS[theme];

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Theme: ${currentLabel}`}
        data-testid="theme-picker-trigger"
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-[var(--radius)] border border-border bg-bg px-3 text-sm text-fg transition-colors hover:bg-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        )}
      >
        <span
          aria-hidden="true"
          className="inline-block h-5 w-5 rounded-full border border-border"
          style={{ background: currentSwatch }}
        />
        <span>{currentLabel}</span>
        <span aria-hidden="true" className="text-muted-fg">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose a theme"
          data-testid="theme-picker-popover"
          className={cn(
            "absolute left-0 top-12 z-20 min-w-[12rem] rounded-[var(--radius)] border border-border bg-bg p-2 shadow-[var(--shadow-pop)]",
          )}
        >
          {THEME_NAMES.map((name, i) => {
            const swatch = `rgb(${THEME_PRESETS[name].light.accent})`;
            const label = THEME_LABELS[name];
            const selected = name === theme;
            return (
              <button
                key={name}
                ref={i === 0 ? firstSwatchRef : undefined}
                type="button"
                role="option"
                aria-current={selected}
                aria-selected={selected}
                aria-label={label}
                data-testid={`theme-picker-${name}`}
                onClick={() => {
                  setTheme(name);
                  setOpen(false);
                  // After a selection, return focus to the trigger so the
                  // next Enter / Space opens the popover again from a
                  // predictable spot.
                  triggerRef.current?.focus();
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 text-left text-sm text-fg transition-colors hover:bg-muted",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  selected && "ring-1 ring-accent",
                )}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-6 w-6 shrink-0 rounded-full border border-border"
                  style={{ background: swatch }}
                />
                <span className="flex-1">{label}</span>
                {selected && (
                  <span aria-hidden="true" className="text-accent">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
