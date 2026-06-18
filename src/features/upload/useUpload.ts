"use client";

import { useCallback, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { ApiError } from "@/lib/api/errors";

export type UploadedFile = {
  url: string;
  filename: string;
  size: number;
  mime: string;
};

export type UploadOptions = {
  sessionId: string;
  personalityId: string;
  onProgress?: (percent: number) => void;
};

export type UseUploadResult = {
  upload: (file: File, opts: UploadOptions) => Promise<UploadedFile>;
  uploading: boolean;
  progress: number;
  error: ApiError | null;
  reset: () => void;
};

/**
 * React hook that uploads a `File` to the CozyCopilot BFF (`/api/cozy/upload`)
 * with progress reporting. We use `XMLHttpRequest` instead of `fetch` because
 * `fetch` does not surface upload progress events — only the XHR `upload`
 * channel fires `progress` events with `loaded`/`total` bytes.
 *
 * The hook reads the JWT from `useAuthStore` and forwards it as a Bearer
 * token. Server errors are normalized into an `ApiError` and re-thrown so
 * callers can branch on `err.code`. The hook also stores the most recent
 * error in state for the UI to render a banner.
 */
export function useUpload(): UseUploadResult {
  const jwt = useAuthStore((s) => s.jwt);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);

  const upload = useCallback(
    async (file: File, opts: UploadOptions): Promise<UploadedFile> => {
      setUploading(true);
      setProgress(0);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("sessionId", opts.sessionId);
        form.append("personalityId", opts.personalityId);

        // XHR for upload-progress events. We can't use fetch because it
        // doesn't expose intermediate progress on the request body.
        const result = await new Promise<UploadedFile>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setProgress(pct);
              opts.onProgress?.(pct);
            }
          });
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const body = JSON.parse(xhr.responseText);
                // BFF returns { ok: true, data: UploadedFile }; unwrap so
                // callers don't have to know the envelope shape.
                resolve((body && typeof body === "object" && "data" in body ? body.data : body) as UploadedFile);
              } catch {
                reject(new ApiError("INVALID_RESPONSE", xhr.responseText, false));
              }
            } else {
              try {
                const body = JSON.parse(xhr.responseText) as {
                  error?: { code?: string; message?: string; retryable?: boolean };
                };
                reject(
                  new ApiError(
                    body.error?.code ?? "UPLOAD_FAILED",
                    body.error?.message ?? "Upload failed",
                    body.error?.retryable ?? true,
                  ),
                );
              } catch {
                reject(new ApiError("UPLOAD_FAILED", `HTTP ${xhr.status}`, true));
              }
            }
          });
          xhr.addEventListener("error", () =>
            reject(new ApiError("NETWORK_ERROR", "Network error", true)),
          );
          xhr.open("POST", "/api/cozy/upload");
          if (jwt) xhr.setRequestHeader("Authorization", `Bearer ${jwt}`);
          xhr.send(form);
        });
        return result;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("UPLOAD_FAILED", String(e), true);
        setError(err);
        throw err;
      } finally {
        setUploading(false);
      }
    },
    [jwt],
  );

  const reset = useCallback(() => {
    setError(null);
    setProgress(0);
  }, []);

  return { upload, uploading, progress, error, reset };
}
