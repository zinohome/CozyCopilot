"use client";

import { useCallback, useRef } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceSend, type UseVoiceSend } from "./useVoiceSend";

export interface VoiceButtonProps {
  sessionId: string | null;
  personalityId: string | null;
  /**
   * Override the underlying hook (testing). Default: a fresh `useVoiceSend`
   * bound to the props above.
   */
  useVoiceSendHook?: (opts: { sessionId: string | null; personalityId: string | null }) => UseVoiceSend;
}

/**
 * Push-to-talk button for the chat Composer header row. Mirrors the upload
 * toggle's visual treatment: ghost variant, `aria-pressed` reflects the
 * recording state, and a `title` tooltip swaps between the two prompts.
 *
 * Interaction:
 *   - onPointerDown  → startRecording()
 *   - onPointerUp    → stopAndSend()
 *   - onPointerLeave → stopAndSend() (user dragged off — treat as release)
 *   - onPointerCancel → cancelRecording() (browser aborted the gesture)
 *   - Space (with focus) → start on keydown, stop on keyup
 *
 * Visual:
 *   - Idle: gray mic icon, "按住说话" tooltip
 *   - Recording: red pulsing ring around the button
 *   - Disabled: gray + `disabled` attr when session/personality not set
 */
export function VoiceButton({ sessionId, personalityId, useVoiceSendHook }: VoiceButtonProps) {
  const useHook = useVoiceSendHook ?? useVoiceSend;
  const { state, startRecording, stopAndSend, cancelRecording } = useHook({
    sessionId,
    personalityId,
  });

  // Refs guard against the case where the user holds the button, the
  // browser fires pointerleave (e.g. they move the cursor off the button),
  // and then a few ms later the real pointerup arrives. Without the latch
  // we'd start a second recording in the middle of the first upload.
  const keyboardActiveRef = useRef(false);
  const pressedRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // Only the primary button should trigger recording.
      if (e.button !== 0) return;
      if (pressedRef.current) return;
      pressedRef.current = true;
      // Capture the pointer so we still get pointerup even if the user
      // drags the cursor off the button.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* setPointerCapture can throw on detached nodes — ignore */
      }
      void startRecording();
    },
    [startRecording],
  );

  const finishPointer = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!pressedRef.current) return;
      pressedRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* node may already be detached — ignore */
      }
      void stopAndSend();
    },
    [stopAndSend],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!pressedRef.current) return;
      pressedRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      cancelRecording();
    },
    [cancelRecording],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== " " && e.key !== "Spacebar") return;
      if (e.repeat) return;
      e.preventDefault();
      if (keyboardActiveRef.current) return;
      keyboardActiveRef.current = true;
      void startRecording();
    },
    [startRecording],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== " " && e.key !== "Spacebar") return;
      if (!keyboardActiveRef.current) return;
      e.preventDefault();
      keyboardActiveRef.current = false;
      void stopAndSend();
    },
    [stopAndSend],
  );

  const isDisabled = !sessionId || !personalityId;
  const isRecording = state.kind === "recording";
  const isBusy = state.kind === "uploading" || state.kind === "playing";
  const tooltip = isRecording
    ? "正在录音…松开发送"
    : isBusy
      ? "正在处理…"
      : "按住说话";

  return (
    <Button
      type="button"
      variant="ghost"
      aria-label="voice-input"
      aria-pressed={isRecording}
      title={tooltip}
      disabled={isDisabled}
      data-state={state.kind}
      onPointerDown={handlePointerDown}
      onPointerUp={finishPointer}
      onPointerLeave={finishPointer}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      className={
        isRecording
          ? "relative bg-red-500/15 text-red-600 hover:bg-red-500/20 dark:text-red-400 ring-2 ring-red-500 animate-pulse"
          : undefined
      }
    >
      <Mic className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{tooltip}</span>
    </Button>
  );
}
