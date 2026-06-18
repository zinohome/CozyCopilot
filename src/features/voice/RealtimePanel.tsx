"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRealtime, type RealtimeState } from "./useRealtime";

export interface RealtimePanelProps {
  sessionId: string;
  personalityId: string;
  /** Called when the user closes the panel after an `ended` or `error` state. */
  onClose?: () => void;
  /** Called when the user wants to fall back to text chat after an error. */
  onFallbackToText?: () => void;
}

const STATE_LABEL: Record<RealtimeState["kind"], string> = {
  idle: "未开始",
  connecting: "正在连接…",
  connected: "已连接",
  active: "通话中",
  ending: "正在结束…",
  ended: "已结束",
  error: "连接失败",
};

/**
 * Full-screen overlay that drives the realtime voice-call lifecycle.
 *
 * Visual model:
 *   - Centered card on top of a dimmed backdrop.
 *   - Status text + a speaking indicator while `active`.
 *   - Two controls: mic mute toggle and a hangup button.
 *   - On `error`, the hangup button is replaced by a "switch to text" CTA
 *     (when `onFallbackToText` is provided) and a "dismiss" button.
 */
export function RealtimePanel({
  sessionId,
  personalityId,
  onClose,
  onFallbackToText,
}: RealtimePanelProps) {
  const { state, start, setMicEnabled, hangup } = useRealtime();
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleStart = useCallback(async () => {
    setBusy(true);
    try {
      await start({ sessionId, personalityId });
    } finally {
      setBusy(false);
    }
  }, [start, sessionId, personalityId]);

  const handleToggleMute = useCallback(async () => {
    const next = !muted;
    setMuted(next);
    try {
      await setMicEnabled(!next);
    } catch {
      // Mute failure is non-fatal — the UI reverts on the next interaction.
      setMuted(muted);
    }
  }, [muted, setMicEnabled]);

  const handleHangup = useCallback(async () => {
    setBusy(true);
    try {
      await hangup();
    } finally {
      setBusy(false);
    }
  }, [hangup]);

  const isCallActive = state.kind === "connected" || state.kind === "active";
  const isError = state.kind === "error";
  const isTerminal = state.kind === "ended" || isError;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="语音通话"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-bg p-6 shadow-lg">
        <header className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg">语音通话</h2>
          <span
            data-testid="realtime-status"
            className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-fg"
          >
            {STATE_LABEL[state.kind]}
          </span>
        </header>

        {state.kind === "active" && state.speaking && (
          <p
            className="mb-4 text-sm text-accent"
            data-testid="speaking-indicator"
            aria-live="polite"
          >
            正在说话…
          </p>
        )}

        {isError && state.kind === "error" && (
          <p
            role="alert"
            data-testid="realtime-error"
            className="mb-4 rounded-md border border-border bg-muted p-3 text-sm text-fg"
          >
            {state.message || "语音通话连接失败"}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          {state.kind === "idle" && (
            <Button
              type="button"
              onClick={handleStart}
              disabled={busy}
              data-testid="realtime-start"
            >
              {busy ? "连接中…" : "开始通话"}
            </Button>
          )}

          {isCallActive && (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={handleToggleMute}
                disabled={busy}
                aria-pressed={muted}
                data-testid="realtime-mute"
              >
                {muted ? "取消静音" : "静音"}
              </Button>
              <Button
                type="button"
                onClick={handleHangup}
                disabled={busy}
                data-testid="realtime-hangup"
                className="bg-accent text-accent-fg"
              >
                {state.kind === "active" ? "挂断" : "结束"}
              </Button>
            </>
          )}

          {state.kind === "ending" && (
            <p className="text-sm text-muted-fg">正在保存通话记录…</p>
          )}

          {isError && (
            <>
              {onFallbackToText && state.kind === "error" && state.canFallback && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onFallbackToText}
                  data-testid="realtime-fallback"
                >
                  切换到文字
                </Button>
              )}
              {onClose && (
                <Button
                  type="button"
                  onClick={onClose}
                  data-testid="realtime-dismiss"
                >
                  关闭
                </Button>
              )}
            </>
          )}

          {state.kind === "ended" && onClose && (
            <Button
              type="button"
              onClick={onClose}
              data-testid="realtime-close"
            >
              完成
            </Button>
          )}
        </div>

        {isTerminal && !isError && (
          <p className="mt-4 text-center text-xs text-muted-fg">
            通话已结束
            {state.kind === "ended" && state.summary
              ? `，共 ${state.summary.turns.length} 轮对话`
              : ""}
          </p>
        )}
      </div>
    </div>
  );
}
