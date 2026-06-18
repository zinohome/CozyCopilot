"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { ApiError } from "@/lib/api/errors";
import { WSClient, type WSEvent } from "@/lib/api/ws";
import { useNotify } from "@/hooks/useNotify";
import { apiFetch } from "./apiFetch";

export type AsyncTask = {
  id: string;
  sessionId: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: { code: string; message: string };
  createdAt: string;
  completedAt?: string;
};

export type UseAsyncTaskOptions = {
  /** WS URL (default: /api/ws/chat — the BFF relay) */
  wsUrl?: string;
  /** Fallback polling interval in ms (default 2000) */
  pollIntervalMs?: number;
  /** If true, send OS notification on completion (default true) */
  notifyOnComplete?: boolean;
  /** Notification title prefix (default "Task completed") */
  notifyTitle?: string;
};

/**
 * Hook that tracks async tasks. Uses WebSocket push (`task_started`,
 * `task_completed` events) when available; falls back to 2s polling if WS is
 * disconnected. The first call to `start(taskId)` opens the socket and the
 * initial fetch. `cancel()` (or unmount) tears everything down.
 *
 * Behavior:
 *  - On WS open, the hook stops polling. Only one transport is active at a
 *    time — WS is the source of truth when alive.
 *  - On WS error / reconnect failure / initial connect failure, polling
 *    starts. Polling uses the BFF GET endpoint
 *    `/api/cozy/chat/async?taskId=...`.
 *  - On `task_completed` (WS) or terminal status (poll), a notification is
 *    sent exactly once per task via `useNotify().send(...)`.
 *
 * @example
 * ```tsx
 * const { task, error, start, cancel } = useAsyncTask();
 * useEffect(() => { start(taskId); return () => cancel(); }, [taskId]);
 * ```
 */
export function useAsyncTask(opts: UseAsyncTaskOptions = {}) {
  const token = useAuthStore((s) => s.jwt);
  const notify = useNotify();
  const pollIntervalMs = opts.pollIntervalMs ?? 2000;
  const notifyOnComplete = opts.notifyOnComplete ?? true;
  const wsUrl = opts.wsUrl ?? "/api/ws/chat";
  const notifyTitle = opts.notifyTitle ?? "Task completed";

  const [task, setTask] = useState<AsyncTask | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  // All cleanup is funneled through these refs so `cancel()` can tear down
  // whichever transport is currently active without re-deriving it.
  const wsRef = useRef<WSClient | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const completedNotifiedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const fetchTask = useCallback(
    async (taskId: string) => {
      try {
        const t = await apiFetch<AsyncTask>(`/api/cozy/chat/async?taskId=${taskId}`, { token });
        setTask(t);
        if (
          (t.status === "completed" || t.status === "failed") &&
          !completedNotifiedRef.current
        ) {
          completedNotifiedRef.current = true;
          if (notifyOnComplete && t.status === "completed") {
            notify.send({
              title: notifyTitle,
              body: typeof t.result === "string" ? t.result : "Task done",
            });
          }
          stopPolling();
        }
        return t;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("UNKNOWN", String(e), true);
        setError(err);
        return null;
      }
    },
    [token, notifyOnComplete, notifyTitle, notify, stopPolling],
  );

  const startPolling = useCallback(
    (taskId: string) => {
      stopPolling();
      void fetchTask(taskId); // initial fetch
      pollTimerRef.current = setInterval(() => {
        void fetchTask(taskId);
      }, pollIntervalMs);
    },
    [fetchTask, pollIntervalMs, stopPolling],
  );

  const connectWS = useCallback(
    (taskId: string) => {
      const url = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}${wsUrl}`;
      const ws = new WSClient({
        url,
        token: token ?? "",
        onReconnecting: () => {
          // On reconnect attempt, mirror to polling so we don't miss state
          // changes while the socket is bouncing. `startPolling` is a no-op
          // if a timer is already scheduled.
          if (!pollTimerRef.current) {
            startPolling(taskId);
          }
        },
        onReconnectFailed: () => {
          // Backing off cap reached — keep polling as the only source.
          if (!pollTimerRef.current) {
            startPolling(taskId);
          }
        },
      });
      wsRef.current = ws;

      const offStarted = ws.on("task_started", (ev: WSEvent) => {
        if (ev.type === "task_started" && ev.taskId === taskId) {
          setTask((prev) => (prev ? { ...prev, status: "running" } : null));
        }
      });
      const offCompleted = ws.on("task_completed", (ev: WSEvent) => {
        if (ev.type === "task_completed" && ev.taskId === taskId) {
          setTask((prev) =>
            prev
              ? {
                  ...prev,
                  status: "completed",
                  result: ev.result,
                  completedAt: new Date().toISOString(),
                }
              : null,
          );
          if (!completedNotifiedRef.current) {
            completedNotifiedRef.current = true;
            if (notifyOnComplete) {
              notify.send({
                title: notifyTitle,
                body: typeof ev.result === "string" ? ev.result : "Task done",
              });
            }
          }
          stopPolling();
        }
      });
      const offError = ws.on("error", () => {
        // On WS error, fall back to polling.
        if (!pollTimerRef.current) startPolling(taskId);
      });

      void ws.connect().catch(() => {
        // Initial connect failed — fall back to polling.
        startPolling(taskId);
      });

      return () => {
        offStarted();
        offCompleted();
        offError();
        ws.close();
      };
    },
    [token, wsUrl, notifyOnComplete, notifyTitle, notify, startPolling, stopPolling],
  );

  const start = useCallback(
    (taskId: string) => {
      if (taskId === taskIdRef.current) return; // already tracking this one
      // Tear down any previous run (defensive — should not happen in normal use).
      cleanupRef.current?.();
      cleanupRef.current = null;

      taskIdRef.current = taskId;
      completedNotifiedRef.current = false;
      setTask({ id: taskId, sessionId: "", status: "pending", createdAt: new Date().toISOString() });
      setError(null);

      if (typeof window !== "undefined") {
        cleanupRef.current = connectWS(taskId);
      } else {
        startPolling(taskId);
      }
    },
    [connectWS, startPolling],
  );

  const cancel = useCallback(() => {
    stopPolling();
    cleanupRef.current?.();
    cleanupRef.current = null;
    taskIdRef.current = null;
  }, [stopPolling]);

  // Auto-stop on unmount.
  useEffect(() => {
    return () => cancel();
  }, [cancel]);

  return { task, error, start, cancel };
}
