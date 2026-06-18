"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { Personality } from "./usePersonalities";
import { usePersonalities } from "./usePersonalities";

export type ModelOption = {
  /** The value sent on the wire. Built-in providers use plain model name; custom providers use `<provider_id>:<model>`. */
  value: string;
  /** Display label shown in the dropdown. */
  label: string;
};

export interface PersonalityPickerProps {
  activeId: string | null;
  onChange: (personalityId: string) => void;
  /** Pre-composed list of model options (built-in + custom providers, encoded). */
  modelOptions: ModelOption[];
  /** Optional fixed set of built-in model names so the picker can default the model when none is set. */
  builtInModels?: string[];
}

export function PersonalityPicker({
  activeId,
  onChange,
  modelOptions,
  builtInModels = [],
}: PersonalityPickerProps) {
  const { items, loading, error, create } = usePersonalities();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const active = items.find((p) => p.id === activeId);

  const handleSelect = (p: Personality) => {
    onChange(p.id);
    setOpen(false);
    setCreating(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await create({
        name: name.trim(),
        systemPrompt: systemPrompt.trim(),
        ...(model ? { /* model not stored server-side in v1; field is read-only on wire */ } : {}),
      });
      onChange(created.id);
      setName("");
      setSystemPrompt("");
      setModel("");
      setCreating(false);
      setOpen(false);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-[var(--radius)] border border-border bg-bg px-3 text-sm text-fg",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        )}
        data-testid="personality-trigger"
      >
        <span className="max-w-[160px] truncate font-medium">
          {active ? active.name : "选择人格"}
        </span>
        <span className="text-muted-fg" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="选择人格"
          className="absolute right-0 z-20 mt-1 w-72 rounded-[var(--radius)] border border-border bg-bg shadow-[var(--shadow-pop)]"
        >
          <div className="max-h-72 overflow-y-auto p-1">
            {loading && (
              <div className="space-y-1 p-2" data-testid="personality-loading">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded bg-muted" />
                ))}
              </div>
            )}

            {!loading && error && (
              <div
                role="alert"
                className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700"
              >
                {error.message}
              </div>
            )}

            {!loading && !error && items.length === 0 && !creating && (
              <div className="p-3 text-xs text-muted-fg">尚无角色，点击下方新建</div>
            )}

            {!loading &&
              !error &&
              items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={p.id === activeId}
                  onClick={() => handleSelect(p)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                    p.id === activeId && "bg-muted",
                  )}
                  data-testid={`personality-option-${p.id}`}
                >
                  <span className="font-medium text-fg">{p.name}</span>
                  {p.model && (
                    <span className="font-mono text-xs text-muted-fg">{p.model}</span>
                  )}
                </button>
              ))}
          </div>

          <div className="border-t border-border p-1">
            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-accent hover:bg-muted"
                data-testid="personality-new"
              >
                + 新建人格
              </button>
            ) : (
              <form onSubmit={handleCreate} className="space-y-2 p-2" data-testid="personality-create-form">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="名称"
                  className="w-full rounded border border-border bg-bg px-2 py-1 text-sm"
                />
                <textarea
                  required
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="系统提示词"
                  rows={3}
                  className="w-full resize-none rounded border border-border bg-bg px-2 py-1 text-sm"
                />
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded border border-border bg-bg px-2 py-1 text-sm"
                >
                  <option value="">（使用默认模型）</option>
                  {builtInModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {modelOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {submitError && (
                  <div role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">
                    {submitError}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="rounded border border-border px-3 py-1 text-xs"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded bg-accent px-3 py-1 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                  >
                    {submitting ? "创建中…" : "创建"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}