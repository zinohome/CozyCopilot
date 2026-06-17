"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth";
import { apiFetch } from "./apiFetch";

// Internal types use camelCase for ergonomics inside the React tree; the
// hook translates to/from the BFF's snake_case wire format.

export type Provider = {
  id: string;
  baseUrl: string;
  model: string;
  label: string;
  isDefault: boolean;
  createdAt: string;
  // api_key is NEVER returned by GET; only sent via POST/PATCH.
};

export type ProviderCreate = {
  baseUrl: string;
  apiKey: string;
  model: string;
  label: string;
  isDefault?: boolean;
};

export type ProviderUpdate = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  label?: string;
  isDefault?: boolean;
};

// Subset used by the /test endpoint: the BFF schema only requires base_url,
// api_key, and model. Keeping this loose lets the test button fire from the
// new-provider form before the user has filled in a label.
export type ProviderTestInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ProviderTestResult = {
  ok: boolean;
  models?: string[];
  latencyMs?: number;
  error?: { code: string; message: string };
};

// --- BFF wire shapes (snake_case) ---

interface ProviderWire {
  id: string;
  base_url: string;
  model: string;
  label: string;
  is_default: boolean;
  created_at: string;
}

interface ProviderListWire {
  providers: ProviderWire[];
}

interface ProviderTestWire {
  ok: boolean;
  models?: string[];
  latency_ms?: number;
  error?: { code: string; message: string };
}

function fromWire(p: ProviderWire): Provider {
  return {
    id: p.id,
    baseUrl: p.base_url,
    model: p.model,
    label: p.label,
    isDefault: p.is_default,
    createdAt: p.created_at,
  };
}

function createToWire(data: ProviderCreate) {
  return {
    base_url: data.baseUrl,
    api_key: data.apiKey,
    model: data.model,
    label: data.label,
    is_default: data.isDefault,
  };
}

function updateToWire(data: ProviderUpdate) {
  const out: Record<string, unknown> = {};
  if (data.baseUrl !== undefined) out.base_url = data.baseUrl;
  if (data.apiKey !== undefined) out.api_key = data.apiKey;
  if (data.model !== undefined) out.model = data.model;
  if (data.label !== undefined) out.label = data.label;
  if (data.isDefault !== undefined) out.is_default = data.isDefault;
  return out;
}

function testFromWire(w: ProviderTestWire): ProviderTestResult {
  return {
    ok: w.ok,
    models: w.models,
    latencyMs: w.latency_ms,
    error: w.error,
  };
}

export function useProviders() {
  const jwt = useAuthStore((s) => s.jwt);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ProviderListWire>("/api/cozy/providers", { token: jwt });
      setProviders((data.providers ?? []).map(fromWire));
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("UNKNOWN", String(e), true));
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (data: ProviderCreate): Promise<Provider> => {
      const wire = await apiFetch<ProviderWire>("/api/cozy/providers", {
        method: "POST",
        token: jwt,
        body: createToWire(data),
      });
      await refresh();
      return fromWire(wire);
    },
    [jwt, refresh],
  );

  const update = useCallback(
    async (id: string, data: ProviderUpdate): Promise<Provider> => {
      const wire = await apiFetch<ProviderWire>(`/api/cozy/providers/${id}`, {
        method: "PATCH",
        token: jwt,
        body: updateToWire(data),
      });
      await refresh();
      return fromWire(wire);
    },
    [jwt, refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await apiFetch<unknown>(`/api/cozy/providers/${id}`, {
        method: "DELETE",
        token: jwt,
      });
      await refresh();
    },
    [jwt, refresh],
  );

  // The /test endpoint returns 200 with `{ok:false, error:...}` on failure
  // rather than a BFF error envelope, so this method NEVER throws on a
  // structured failure — it returns the body as-is for the caller to render.
  // It only throws on a true transport error (network down, 5xx, etc).
  const test = useCallback(
    async (data: ProviderTestInput): Promise<ProviderTestResult> => {
      const wire = await apiFetch<ProviderTestWire>("/api/cozy/providers/test", {
        method: "POST",
        token: jwt,
        body: {
          base_url: data.baseUrl,
          api_key: data.apiKey,
          model: data.model,
        },
      });
      return testFromWire(wire);
    },
    [jwt],
  );

  return { providers, loading, error, refresh, create, update, remove, test };
}
