"use client";

export type UploadProgressProps = {
  /** 0-100 percent value. Anything < 100 shows a "Uploading…" label. */
  progress: number;
  /** Optional filename shown to the left of the percentage. */
  filename?: string;
  className?: string;
};

/**
 * Compact progress indicator for an in-flight upload. Pulled out of
 * `UploadDropzone` so a parent (e.g. the chat `Composer`) can show the
 * same visual treatment at a different layout — e.g. inline with the
 * textarea, attached to a message bubble, etc.
 *
 * Visual treatment matches `UploadDropzone`:
 *   - thin orange bar on a neutral track
 *   - "Uploading…" label while in flight
 *   - percentage to the right
 *   - filename to the left (when provided)
 */
export function UploadProgress({ progress, filename, className = "" }: UploadProgressProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div
      data-testid="upload-progress-indicator"
      data-progress={clamped}
      className={`flex items-center gap-2 text-xs text-neutral-700 ${className}`}
    >
      {filename && <span className="truncate font-medium">{filename}</span>}
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-neutral-200">
        <div
          className="h-full bg-orange-500 transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="tabular-nums">{clamped}%</span>
    </div>
  );
}
