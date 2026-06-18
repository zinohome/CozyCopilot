"use client";

import { useState } from "react";
import { useAsyncTask } from "./useAsyncTask";
import { AsyncTaskCard } from "./AsyncTaskCard";

/**
 * Demo list for tracking one or more async tasks by ID. This is a thin
 * wrapper over `useAsyncTask` — the hook is the reusable piece, the list is
 * a developer/QA surface for exercising the hook against a real BFF.
 *
 * Note: the hook is single-task (one `task` in state at a time). The list
 * itself keeps an array of IDs to render; only the ID matching the current
 * `task.id` is shown via `AsyncTaskCard`, the rest are rendered as a
 * "loading" placeholder.
 */
export function AsyncTaskList() {
  const [trackedIds, setTrackedIds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const { task, error, start, cancel } = useAsyncTask();

  const handleAdd = () => {
    const id = input.trim();
    if (!id) return;
    setTrackedIds((prev) => [...prev, id]);
    start(id);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Task ID"
          className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={handleAdd}
          className="rounded bg-orange-500 px-3 py-1.5 text-sm text-white hover:bg-orange-600"
        >
          Track
        </button>
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error.message}
        </div>
      )}
      <div className="space-y-2">
        {trackedIds.map((id) => (
          <div key={id}>
            {task && task.id === id ? (
              <AsyncTaskCard task={task} />
            ) : (
              <div className="text-xs text-neutral-500">Loading {id}…</div>
            )}
          </div>
        ))}
        {trackedIds.length === 0 && (
          <div className="text-xs text-neutral-500">
            No tasks tracked. Paste a task ID to start.
          </div>
        )}
      </div>
      {trackedIds.length > 0 && (
        <button
          onClick={() => {
            cancel();
            setTrackedIds([]);
          }}
          className="rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
