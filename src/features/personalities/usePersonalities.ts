"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth";
import { apiFetch } from "./apiFetch";

// Internal types use camelCase for ergonomics inside the React tree; the
// hook translates to/from the BFF's snake_case wire format.

export type Personality = {
  id: string;
  name: string;
  systemPrompt: string;
  description?: string;
  avatarUrl?: string;
  model?: string;
  createdAt: string;
};

export type PersonalityCreate = {
  name: string;
  systemPrompt: string;
  description?: string;
  avatarUrl?: string;
};

// --- BFF wire shapes (snake_case) ---

interface PersonalityWire {
  id: string;
  name: string;
  system_prompt: string;
  description?: string;
  avatar_url?: string;
  model?: string;
  created_at: string;
}

interface PersonalityListWire {
  personalities: PersonalityWire[];
}

function fromWire(p: PersonalityWire): Personality {
  return {
    id: p.id,
    name: p.name,
    systemPrompt: p.system_prompt,
    description: p.description,
    avatarUrl: p.avatar_url,
    model: p.model,
    createdAt: p.created_at,
  };
}

function createToWire(data: PersonalityCreate) {
  return {
    name: data.name,
    system_prompt: data.systemPrompt,
    description: data.description,
    avatar_url: data.avatarUrl,
  };
}

export function usePersonalities() {
  const jwt = useAuthStore((s) => s.jwt);
  const [items, setItems] = useState<Personality[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<PersonalityListWire>("/api/cozy/personalities", {
        token: jwt,
      });
      setItems((data.personalities ?? []).map(fromWire));
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
    async (data: PersonalityCreate): Promise<Personality> => {
      const wire = await apiFetch<PersonalityWire>("/api/cozy/personalities", {
        method: "POST",
        token: jwt,
        body: createToWire(data),
      });
      await refresh();
      return fromWire(wire);
    },
    [jwt, refresh],
  );

  return { items, loading, error, refresh, create };
}