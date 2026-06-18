import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "@/features/chat/Composer";
import { useSessionStore } from "@/stores/session";
import { useAuthStore } from "@/stores/auth";

// Stub the underlying `useVoiceSend` hook so the integration test only
// verifies Composer's wiring (props passed through, button rendered next
// to the upload toggle). The hook's own behavior is covered in
// `useVoiceSend.test.ts` and `VoiceButton.test.tsx`.
vi.mock("@/features/voice/useVoiceSend", async () => {
  const actual = await vi.importActual<typeof import("@/features/voice/useVoiceSend")>(
    "@/features/voice/useVoiceSend",
  );
  const stub: import("@/features/voice/useVoiceSend").UseVoiceSend = {
    state: { kind: "idle" },
    startRecording: vi.fn(async () => {}),
    stopAndSend: vi.fn(async () => null),
    cancelRecording: vi.fn(() => {}),
  };
  return {
    ...actual,
    useVoiceSend: vi.fn(() => stub),
  };
});

beforeEach(() => {
  useSessionStore.getState().clear();
  useSessionStore.setState({
    activeSessionId: "sess-integration",
    activePersonalityId: "pers-integration",
  });
  useAuthStore.setState({ jwt: "test-jwt", userId: "u1", email: "u@x", role: "user" });
});

describe("Composer + VoiceButton integration", () => {
  it("renders the VoiceButton when voiceEnabled is true and ids are set", () => {
    render(
      <Composer
        onSend={vi.fn()}
        disabled={false}
        sessionId="sess-integration"
        personalityId="pers-integration"
        voiceEnabled
      />,
    );
    expect(screen.getByRole("button", { name: /voice-input/i })).toBeInTheDocument();
  });

  it("does NOT render the VoiceButton when voiceEnabled is false (legacy text-only)", () => {
    render(
      <Composer
        onSend={vi.fn()}
        disabled={false}
        sessionId="sess-integration"
        personalityId="pers-integration"
        // voiceEnabled omitted → false by default
      />,
    );
    expect(screen.queryByRole("button", { name: /voice-input/i })).not.toBeInTheDocument();
  });

  it("VoiceButton is rendered but disabled when only voiceEnabled is set without ids", () => {
    render(<Composer onSend={vi.fn()} disabled={false} voiceEnabled />);
    const btn = screen.getByRole("button", { name: /voice-input/i });
    expect(btn).toBeDisabled();
  });

  it("typing in the textarea + Enter still triggers onSend alongside the voice button", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(
      <Composer
        onSend={onSend}
        disabled={false}
        sessionId="sess-integration"
        personalityId="pers-integration"
        voiceEnabled
      />,
    );
    const input = screen.getByRole("textbox");
    await act(async () => {
      fireEvent.change(input, { target: { value: "hello world" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(onSend).toHaveBeenCalledWith("hello world");
    // VoiceButton is still present alongside the send affordances.
    expect(screen.getByRole("button", { name: /voice-input/i })).toBeInTheDocument();
  });
});