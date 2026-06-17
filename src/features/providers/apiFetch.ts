// Minimal BFF fetch helper for the providers feature.
//
// Lives in the feature directory because the task's rules say
// "Do NOT touch any file outside src/features/providers/ or
// app/(web)/settings/providers/". The shared src/lib/api/client.ts only
// exposes a GET-only `get` method, but provider CRUD needs POST/PATCH/DELETE.
//
// Returns the BFF envelope's `data` field on success and throws an
// `ApiError` (built from the envelope's `error` block) on failure. The test
// endpoint is the exception: see the comment in `useProviders.ts` — it
// returns a structured failure inside an ok:true envelope, so callers must
// inspect `result.ok` themselves rather than catching an exception.

import { ApiError } from "@/lib/api/errors";

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
}

interface BffEnvelope<T> {
  ok: true;
  data: T;
}
interface BffErrorEnvelope {
  ok: false;
  error: { code: string; message: string; userMessage?: string; retryable?: boolean };
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers,
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  const res = await fetch(path, init);
  const text = await res.text();
  let parsed: BffEnvelope<T> | BffErrorEnvelope | null = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as BffEnvelope<T> | BffErrorEnvelope;
    } catch {
      // Non-JSON body — treat as transport failure
    }
  }

  if (!parsed) {
    throw new ApiError(
      "UNKNOWN",
      `non-JSON response (HTTP ${res.status})`,
      res.status >= 500,
    );
  }

  if (parsed.ok) {
    return parsed.data;
  }

  throw new ApiError(
    parsed.error.code,
    parsed.error.message,
    parsed.error.retryable ?? false,
  );
}
