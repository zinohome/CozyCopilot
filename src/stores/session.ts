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

  clear: () => set({ messages: [], streamingMessageId: null }),
}));
