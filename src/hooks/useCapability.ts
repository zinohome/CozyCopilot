"use client";

import { useEffect, useState, useCallback } from "react";
import * as cap from "@/lib/capabilities";

export type MicPermission = "granted" | "denied" | "prompt" | "unsupported";

export type CapabilityState = {
  micPermission: MicPermission;
  isNativeApp: boolean;
  platform: string;
  loading: boolean;
};

/**
 * React hook that exposes the current platform's capability state
 * (microphone permission, isNativeApp, platform name) and re-fetches
 * the mic permission whenever the consumer calls `refresh()`.
 *
 * The capability module loads at module evaluation; this hook just
 * surfaces its state and lets the UI react to changes.
 *
 * - `isNativeApp` and `platform` are stable for the lifetime of the
 *   page — they are derived from module-level globals and do not
 *   change between renders.
 * - `micPermission` is refreshed once on mount and again on every
 *   `refresh()` call. Call `refresh()` after a user action that may
 *   have changed the underlying permission (e.g. after returning
 *   from a system settings page).
 *
 * @example
 * ```tsx
 * const { micPermission, refresh } = useCapability();
 * useEffect(() => { void refresh(); }, [refresh]);
 * ```
 */
export function useCapability(): CapabilityState & {
  refresh: () => Promise<void>;
} {
  const [micPermission, setMicPermission] = useState<MicPermission>("prompt");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const state = await cap.checkMicrophonePermission();
      setMicPermission(state);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    micPermission,
    isNativeApp: cap.isNativeApp,
    platform: cap.getPlatform(),
    loading,
    refresh,
  };
}
