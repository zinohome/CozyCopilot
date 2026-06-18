import { create } from "zustand";

export type MessageStatus = "sending" | "streaming" | "done" | "error" | "superseded";
export type ErrorCode = string;

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: MessageStatus;
  errorCode?: ErrorCode;
  metadata?: Record<string, unknown>;
}

export interface SessionState {
  messages: Message[];
  streamingMessageId: string | null;
  /**
   * M4.6: the active session and personality. These are page-level
   * identity (not message state), so they live in the same store so
   * `MessageList` / `Composer` can read them without prop-drilling.
   * `null` means "not yet selected" — the UI shows the picker empty.
   */
  activeSessionId: string | null;
  activePersonalityId: string | null;
  setActiveSession: (id: string | null) => void;
  setActivePersonality: (id: string | null) => void;
  appendMessage: (msg: Omit<Message, "id"> & { id?: string }) => void;
  startStreaming: (id: string) => void;
  appendDelta: (id: string, delta: string) => void;
  finishStreaming: (id: string) => void;
  markError: (id: string, code: ErrorCode) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  messages: [],
  streamingMessageId: null,
  activeSessionId: null,
  activePersonalityId: null,

  setActiveSession: (id) => set({ activeSessionId: id }),
  setActivePersonality: (id) => set({ activePersonalityId: id }),

  appendMessage: (msg) =>
    set((s) => ({
      messages: [...s.messages, { ...msg, id: msg.id ?? crypto.randomUUID() } as Message],
    })),

  startStreaming: (id) =>
    set((s) => ({
      messages: [...s.messages, { id, role: "assistant", content: "", status: "streaming" }],
      streamingMessageId: id,
    })),

  appendDelta: (id, delta) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
    })),

  finishStreaming: (id) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, status: "done" } : m)),
      streamingMessageId: null,
    })),

  markError: (id, code) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, status: "error", errorCode: code } : m,
      ),
      streamingMessageId: null,
    })),

  clear: () =>
    // Only clears message state — personality/session identity persists.
    // Use `setActiveSession(null)` to explicitly switch sessions.
    set({ messages: [], streamingMessageId: null }),
}));
