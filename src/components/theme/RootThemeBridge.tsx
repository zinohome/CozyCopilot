"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/stores/theme";
import { applyThemeToDom } from "./applyThemeToDom";

/**
 * Mount-once client bridge that syncs the theme store into the DOM.
 *
 * On mount it reads the current `theme` + `mode` from the store and
 * calls `applyThemeToDom`. The blocking inline script in
 * `app/layout.tsx` has already painted the right palette before paint,
 * so this hook is mostly a defense against a rehydration race when
 * `persist` is mid-flight.
 *
 * It also subscribes to subsequent changes so flipping themes in the
 * Settings page updates `<html>` immediately.
 */
export function RootThemeBridge(): null {
  const theme = useThemeStore((s) => s.theme);
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => {
    return applyThemeToDom(theme, mode);
  }, [theme, mode]);

  return null;
}
