"use client";

import { useCallback, useState, type DragEvent } from "react";
import { useUpload, type UploadedFile } from "./useUpload";

export type UploadDropzoneProps = {
  sessionId: string;
  personalityId: string;
  onUploaded: (file: UploadedFile) => void;
  accept?: string;
  className?: string;
};

/**
 * Drag-and-drop / click-to-choose file upload zone. Wraps `useUpload` and
 * surfaces progress + error state inline. Theme: warm orange accent on
 * drag-over and progress bar, matching the rest of the app.
 */
export function UploadDropzone({
  sessionId,
  personalityId,
  onUploaded,
  accept = "image/*,application/pdf,text/plain,application/json",
  className = "",
}: UploadDropzoneProps) {
  const { upload, uploading, progress, error } = useUpload();
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      try {
        const result = await upload(file, { sessionId, personalityId });
        onUploaded(result);
      } catch {
        // error is already stored in the hook's state; UI renders it below
      }
    },
    [upload, sessionId, personalityId, onUploaded],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    void handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      data-testid="upload-dropzone"
      data-drag-over={dragOver}
      data-uploading={uploading}
      className={`rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors ${
        dragOver ? "border-orange-500 bg-orange-50" : "border-neutral-300 bg-neutral-50"
      } ${className}`}
    >
      {uploading ? (
        <div data-testid="upload-progress">
          <div className="mb-1 text-neutral-700">Uploading… {progress}%</div>
          <div className="h-2 overflow-hidden rounded bg-neutral-200">
            <div
              className="h-full bg-orange-500 transition-all"
              style={{ width: `${progress}%` }}
              data-testid="upload-progress-bar"
              data-progress={progress}
            />
          </div>
        </div>
      ) : (
        <label className="cursor-pointer text-neutral-600">
          Drop a file or <span className="text-orange-600 underline">click to choose</span>
          <input
            type="file"
            accept={accept}
            data-testid="upload-file-input"
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
      )}
      {error && (
        <div data-testid="upload-error" className="mt-2 text-xs text-red-700">
          {error.message}
        </div>
      )}
    </div>
  );
}
