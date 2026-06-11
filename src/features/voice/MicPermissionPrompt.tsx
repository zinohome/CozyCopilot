"use client";

import { useCapability } from "@/hooks/useCapability";
import { requestMicrophonePermission } from "@/lib/capabilities";
import { useCallback, useState } from "react";

export type MicPermissionPromptProps = {
  onGranted?: () => void;
  onDenied?: () => void;
};

/**
 * Inline UI that prompts the user to grant microphone permission.
 * Use this in a modal or a dedicated permission-setup screen.
 *
 * The component reads the current permission state from the capability
 * module and conditionally renders one of:
 *   - "Prompt" state: a "Allow microphone" button that triggers
 *     `getUserMedia()` (the browser's permission UI)
 *   - "Granted" state: a "Microphone ready" badge + onGranted callback
 *   - "Denied" state: instructions to enable the mic in browser settings
 *   - "Unsupported" state: a fallback message
 */
export function MicPermissionPrompt({ onGranted, onDenied }: MicPermissionPromptProps) {
  const { micPermission, loading, refresh } = useCapability();
  const [requesting, setRequesting] = useState(false);

  const handleRequest = useCallback(async () => {
    setRequesting(true);
    try {
      const ok = await requestMicrophonePermission();
      await refresh();
      if (ok) onGranted?.();
      else onDenied?.();
    } finally {
      setRequesting(false);
    }
  }, [onGranted, onDenied, refresh]);

  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
        Checking microphone status…
      </div>
    );
  }

  if (micPermission === "granted") {
    return (
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
        <span aria-label="mic-ready" role="img">🎤</span> Microphone ready
      </div>
    );
  }

  if (micPermission === "denied") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        Microphone access is blocked. Open your browser&apos;s site settings
        and grant microphone permission, then reload the page.
      </div>
    );
  }

  if (micPermission === "unsupported") {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
        This device or browser does not support voice input. Use text chat instead.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="mb-3 text-sm text-neutral-700">
        CozyCopilot needs microphone access for voice chat.
      </p>
      <button
        type="button"
        onClick={handleRequest}
        disabled={requesting}
        className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {requesting ? "Requesting…" : "Allow microphone"}
      </button>
    </div>
  );
}
