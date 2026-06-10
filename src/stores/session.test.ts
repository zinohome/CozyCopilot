import { describe, it, expect, beforeEach } from "vitest";
import { useSessionStore } from "./session";

describe("useSessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState({
      messages: [],
      streamingMessageId: null,
    });
  });

  it("appendMessage adds a message", () => {
    useSessionStore.getState().appendMessage({
      id: "m1",
      role: "user",
      content: "hi",
      status: "done",
    });
    expect(useSessionStore.getState().messages).toHaveLength(1);
  });

  it("startStreaming creates an empty assistant message", () => {
    useSessionStore.getState().startStreaming("a1");
    const msg = useSessionStore.getState().messages[0];
    expect(msg.role).toBe("assistant");
    expect(msg.status).toBe("streaming");
    expect(useSessionStore.getState().streamingMessageId).toBe("a1");
  });

  it("appendDelta appends text to the streaming message", () => {
    useSessionStore.getState().startStreaming("a1");
    useSessionStore.getState().appendDelta("a1", "hello ");
    useSessionStore.getState().appendDelta("a1", "world");
    expect(useSessionStore.getState().messages[0].content).toBe("hello world");
  });

  it("finishStreaming marks done and clears streamingMessageId", () => {
    useSessionStore.getState().startStreaming("a1");
    useSessionStore.getState().finishStreaming("a1");
    expect(useSessionStore.getState().messages[0].status).toBe("done");
    expect(useSessionStore.getState().streamingMessageId).toBeNull();
  });

  it("markError sets status error", () => {
    useSessionStore.getState().startStreaming("a1");
    useSessionStore.getState().markError("a1", "STREAM_INTERRUPTED");
    expect(useSessionStore.getState().messages[0].status).toBe("error");
  });
});
