"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSessions, type Session } from "./useSessions";

export interface SessionListProps {
  activeId: string | null;
  onSelect: (sessionId: string) => void;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return "刚刚";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} 天前`;
  return new Date(iso).toLocaleDateString();
}

export function SessionList({ activeId, onSelect }: SessionListProps) {
  const { items, loading, error, create, rename, remove, refresh } = useSessions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const handleCreate = async () => {
    const s = await create();
    onSelect(s.id);
  };

  const handleStartRename = (s: Session) => {
    setEditingId(s.id);
    setEditingValue(s.title ?? "");
  };

  const handleCommitRename = async (s: Session) => {
    const next = editingValue.trim();
    setEditingId(null);
    if (!next || next === s.title) return;
    await rename(s.id, next);
  };

  const handleDelete = (s: Session) => {
    // v1: simple confirm dialog. Polished dialog UX lands in M7 themes.
    if (typeof window !== "undefined" && !window.confirm(`删除会话「${s.title ?? "未命名会话"}」？`)) {
      return;
    }
    void remove(s.id);
  };

  if (loading) {
    return (
      <div className="space-y-1 p-2" data-testid="sessions-loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
        <div className="mb-1" data-testid="sessions-error">
          {error.message}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-100"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="session-list">
      <button
        type="button"
        onClick={handleCreate}
        className="rounded-[var(--radius)] bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
        data-testid="session-new"
      >
        + 新建会话
      </button>

      {items.length === 0 ? (
        <div className="p-3 text-xs text-muted-fg">尚无会话，点击上方新建</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((s) => {
            const isEditing = editingId === s.id;
            return (
              <li
                key={s.id}
                data-testid={`session-row-${s.id}`}
                className={cn(
                  "group flex items-center gap-1 rounded-[var(--radius-sm)] border border-transparent px-2 py-1.5",
                  s.id === activeId
                    ? "border-accent bg-accent/10"
                    : "hover:bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="flex flex-1 flex-col items-start gap-0.5 text-left"
                  data-testid={`session-select-${s.id}`}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => void handleCommitRename(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleCommitRename(s);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full rounded border border-border bg-bg px-1 py-0.5 text-sm"
                    />
                  ) : (
                    <span className="w-full truncate text-sm text-fg">
                      {s.title || "未命名会话"}
                    </span>
                  )}
                  <span className="text-xs text-muted-fg">{formatRelative(s.updatedAt)}</span>
                </button>

                {!isEditing && (
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleStartRename(s)}
                      className="rounded px-1.5 py-0.5 text-xs text-muted-fg hover:bg-bg hover:text-fg"
                      aria-label={`重命名 ${s.title ?? s.id}`}
                      data-testid={`session-rename-${s.id}`}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                      aria-label={`删除 ${s.title ?? s.id}`}
                      data-testid={`session-delete-${s.id}`}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}