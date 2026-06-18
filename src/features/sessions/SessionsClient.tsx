"use client";

import { SessionList, type SessionListProps } from "./SessionList";

/**
 * Top-level wiring for the session list. Currently a thin pass-through —
 * the hook owns all state, so the client just composes. The split keeps
 * `SessionList` testable in isolation and leaves room for additional
 * chrome (header, empty-state art) to be added here in M7 themes.
 */
export function SessionsClient(props: SessionListProps) {
  return <SessionList {...props} />;
}