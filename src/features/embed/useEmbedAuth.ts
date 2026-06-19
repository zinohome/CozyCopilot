"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth";

/**
 * M6.4 — exchanges an embed API key for a short-lived JWT via the
 * BFF at `/api/cozy/auth/embed-token`, then writes the result into
 * `useAuthStore` so the rest of the widget (chat transport, voice,
 * memory) can read the bearer token through the same code path as a
 * regular user login.
 *
 * The hook is `idle` until `key` becomes a non-null string (so a
 * widget loaded with `?key=…` from the loader reaches the loading
 * state on mount; a widget loaded without a key stays idle and the
 * composer stays disabled).
 *
 * Failure modes:
 *   - `key === null` → `idle` (no fetch).
 *   - upstream 401   → `error` with code UNAUTHORIZED, not retryable.
 *   - upstream 4xx/5xx/502 → `error` with the upstream code; retryable
 *     when the upstream says so.
 *   - fetch threw     → `error` with code NETWORK, retryable.
 */
export interface EmbedAuthState {
  status: "idle" | "loading" | "authenticated" | "error";
  jwt: string | null;
  error: { code: string; userMessage: string } | null;
}

interface EmbedTokenData {
  jwt: string;
  userId: string;
  email: string;
  role: "user" | "admin" | "designer";
}

interface BffErrorBody {
  ok?: boolean;
  error?: { code?: string; userMessage?: string; retryable?: boolean };
}

export function useEmbedAuth(key: string | null): EmbedAuthState {
  const [state, setState] = useState<EmbedAuthState>({
    status: key ? "loading" : "idle",
    jwt: null,
    error: null,
  });

  useEffect(() => {
    // No key (e.g. embed loaded standalone in dev): stay idle.
    if (!key) {
      setState({ status: "idle", jwt: null, error: null });
      return;
    }

    // Reset to loading every time the key changes — re-runs when the
    // loader rewrites the iframe URL with a new key (rare, but the
    // brief calls for it).
    const controller = new AbortController();
    setState({ status: "loading", jwt: null, error: null });

    (async () => {
      try {
        const res = await fetch("/api/cozy/auth/embed-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
          signal: controller.signal,
        });

        if (!res.ok) {
          // Map BFF error envelope into our local state. The BFF
          // returns `{ ok: false, error: { code, userMessage, retryable } }`
          // (see lib/api/bff.ts#errorResponse). We default to a generic
          // UNKNOWN code so non-JSON or unexpected shapes still flip
          // the UI to the error path without crashing.
          let body: BffErrorBody = {};
          try {
            body = (await res.json()) as BffErrorBody;
          } catch {
            // Non-JSON body — keep the default.
          }
          const errCode = body.error?.code ?? "UNKNOWN";
          const errMessage = body.error?.userMessage ?? "认证失败，请稍后重试";
          setState({
            status: "error",
            jwt: null,
            error: { code: errCode, userMessage: errMessage },
          });
          return;
        }

        const payload = (await res.json()) as { ok: true; data: EmbedTokenData };
        if (!payload.ok || !payload.data?.jwt) {
          setState({
            status: "error",
            jwt: null,
            error: { code: "UNKNOWN", userMessage: "认证失败，请稍后重试" },
          });
          return;
        }

        const { jwt, userId, email, role } = payload.data;
        // Write into the shared auth store so chat/voice/memory read
        // the same JWT the regular login flow would have set.
        useAuthStore.getState().setAuth(jwt, userId, email, role);

        setState({ status: "authenticated", jwt, error: null });
      } catch (e) {
        // AbortError is the expected cleanup path when `key` changes
        // or the component unmounts mid-fetch. Don't surface it.
        if (e instanceof DOMException && e.name === "AbortError") return;
        setState({
          status: "error",
          jwt: null,
          error: { code: "NETWORK", userMessage: "认证失败，请稍后重试" },
        });
      }
    })();

    return () => controller.abort();
  }, [key]);

  return state;
}
