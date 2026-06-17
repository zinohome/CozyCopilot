"use client";

import type { AsyncTask } from "./useAsyncTask";

/**
 * Compact card showing a single async task's status, identifier, and (when
 * terminal) result or error. The visual style is part of the warm-orange
 * theme: running uses the orange accent, completed uses a soft green, failed
 * uses a soft red, and pending uses neutral. The pulsing dot on the running
 * state is the only motion in the card — keeps the chat list from feeling
 * busy when several tasks are tracked at once.
 */
export function AsyncTaskCard({ task }: { task: AsyncTask }) {
  const isDone = task.status === "completed" || task.status === "failed";
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        task.status === "failed"
          ? "border-red-200 bg-red-50"
          : task.status === "completed"
            ? "border-green-200 bg-green-50"
            : "border-orange-200 bg-orange-50"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            task.status === "running"
              ? "bg-orange-500 animate-pulse"
              : task.status === "completed"
                ? "bg-green-500"
                : task.status === "failed"
                  ? "bg-red-500"
                  : "bg-neutral-400"
          }`}
        />
        <span className="font-medium">
          {task.status === "running"
            ? "Running…"
            : task.status === "completed"
              ? "Completed"
              : task.status === "failed"
                ? "Failed"
                : "Pending"}
        </span>
        <span className="font-mono text-xs text-neutral-500">{task.id.slice(0, 8)}</span>
      </div>
      {isDone && task.result != null && (
        <div className="mt-2 text-xs text-neutral-700">
          Result:{" "}
          <span className="font-mono">
            {typeof task.result === "string"
              ? task.result.slice(0, 100)
              : JSON.stringify(task.result).slice(0, 100)}
          </span>
        </div>
      )}
      {task.error && (
        <div className="mt-2 text-xs text-red-700">
          {task.error.code}: {task.error.message}
        </div>
      )}
    </div>
  );
}
