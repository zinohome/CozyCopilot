"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth";
import { apiFetch } from "./apiFetch";

// Internal types use camelCase for ergonomics inside the React tree; the
// hook translates to/from the BFF's snake_case wire format.

export type Session = {
  id: string;
  personalityId?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
};

export type SessionCreate = {
  personalityId?: string;
  title?: string;
};

export type SessionUpdate = {
  title?: string;
  personalityId?: string;
};

// --- BFF wire shapes (snake_case) ---

interface SessionWire {
  id: string;
  personality_id?: string;
  title?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

interface SessionListWire {
  sessions: SessionWire[];
}

function fromWire(s: SessionWire): Session {
  return {
    id: s.id,
    personalityId: s.personality_id,
    title: s.title,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    messageCount: s.message_count,
  };
}

function createToWire(data: SessionCreate) {
  return {
    personality_id: data.personalityId,
    title: data.title,
  };
}

// `rename` sends a single-field PATCH directly; this helper is reserved for
// future personality-switch support (M5). Kept exported for completeness but
// not wired up yet — ESLint would otherwise flag it as unused.
// Reserved for future personality-switch support (M5). Currently `rename`
// sends a single-field PATCH directly; once M5 adds per-session personality
// switching, this helper is the place to translate `SessionUpdate` to wire.
function _updateToWire(data: SessionUpdate) {
  const out: Record<string, unknown> = {};
  if (data.title !== undefined) out.title = data.title;
  if (data.personalityId !== undefined) out.personality_id = data.personalityId;
  return out;
}
void _updateToWire;

export function useSessions() {
  const jwt = useAuthStore((s) => s.jwt);
  const [items, setItems] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SessionListWire>("/api/cozy/sessions", { token: jwt });
      setItems((data.sessions ?? []).map(fromWire));
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
    async (data: SessionCreate = {}): Promise<Session> => {
      const wire = await apiFetch<SessionWire>("/api/cozy/sessions", {
        method: "POST",
        token: jwt,
        body: createToWire(data),
      });
      await refresh();
      return fromWire(wire);
    },
    [jwt, refresh],
  );

  const rename = useCallback(
    async (id: string, title: string): Promise<Session> => {
      const wire = await apiFetch<SessionWire>(`/api/cozy/sessions/${id}`, {
        method: "PATCH",
        token: jwt,
        body: { title },
      });
      await refresh();
      return fromWire(wire);
    },
    [jwt, refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await apiFetch<unknown>(`/api/cozy/sessions/${id}`, {
        method: "DELETE",
        token: jwt,
      });
      await refresh();
    },
    [jwt, refresh],
  );

  return { items, loading, error, refresh, create, rename, remove };
}