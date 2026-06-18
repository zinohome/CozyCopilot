import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock `useRealtime` so the panel is exercised against a controllable state
// machine without spinning up the livekit-client module.
const start = vi.fn();
const setMicEnabled = vi.fn();
const hangup = vi.fn();
const useRealtimeMock = vi.fn();

vi.mock("./useRealtime", () => ({
  useRealtime: (...args: unknown[]) => useRealtimeMock(...args),
}));

import { RealtimePanel } from "./RealtimePanel";
import { useAuthStore } from "@/stores/auth";

function setRealtimeState(overrides: Partial<{
  state: object;
  start: () => Promise<void>;
  setMicEnabled: (enabled: boolean) => Promise<void>;
  hangup: () => Promise<void>;
  lastSummary: object | null;
}> = {}) {
  useRealtimeMock.mockReturnValue({
    state: { kind: "idle" },
    start,
    setMicEnabled,
    hangup,
    lastSummary: null,
    ...overrides,
  });
}

describe("RealtimePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ jwt: "test-jwt", userId: "u-1", email: "a@b.c", role: "user" });
    start.mockResolvedValue(undefined);
    setMicEnabled.mockResolvedValue(undefined);
    hangup.mockResolvedValue(undefined);
    setRealtimeState();
  });

  it("renders the idle state with a start button", () => {
    render(
      <RealtimePanel
        sessionId="s-1"
        personalityId="p-1"
      />,
    );
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("未开始");
    expect(screen.getByTestId("realtime-start")).toBeInTheDocument();
  });

  it("clicking start invokes start() with session + personality IDs", async () => {
    const user = userEvent.setup();
    render(
      <RealtimePanel
        sessionId="s-1"
        personalityId="p-1"
      />,
    );
    await user.click(screen.getByTestId("realtime-start"));
    expect(start).toHaveBeenCalledWith({
      sessionId: "s-1",
      personalityId: "p-1",
    });
  });

  it("renders mic + hangup controls in the `active` state", () => {
    setRealtimeState({ state: { kind: "active", speaking: false } });
    render(
      <RealtimePanel
        sessionId="s-1"
        personalityId="p-1"
      />,
    );
    expect(screen.getByTestId("realtime-mute")).toBeInTheDocument();
    expect(screen.getByTestId("realtime-hangup")).toBeInTheDocument();
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("通话中");
  });

  it("shows the speaking indicator when state.speaking is true", () => {
    setRealtimeState({ state: { kind: "active", speaking: true } });
    render(
      <RealtimePanel
        sessionId="s-1"
        personalityId="p-1"
      />,
    );
    expect(screen.getByTestId("speaking-indicator")).toHaveTextContent(/正在说话/);
  });

  it("toggling mute calls setMicEnabled with the inverse of the current state", async () => {
    const user = userEvent.setup();
    setRealtimeState({ state: { kind: "active", speaking: false } });
    render(
      <RealtimePanel
        sessionId="s-1"
        personalityId="p-1"
      />,
    );
    await user.click(screen.getByTestId("realtime-mute"));
    await waitFor(() => {
      // The button text becomes "取消静音" (unmute) so the next call should
      // re-enable: setMicEnabled(true). We assert that the first click
      // passed false.
      expect(setMicEnabled).toHaveBeenCalledWith(false);
    });
  });

  it("clicking hangup invokes hangup()", async () => {
    const user = userEvent.setup();
    setRealtimeState({ state: { kind: "active", speaking: false } });
    render(
      <RealtimePanel
        sessionId="s-1"
        personalityId="p-1"
      />,
    );
    await user.click(screen.getByTestId("realtime-hangup"));
    expect(hangup).toHaveBeenCalled();
  });

  it("error state surfaces the fallback CTA and dismiss button", () => {
    const onFallback = vi.fn();
    const onClose = vi.fn();
    setRealtimeState({
      state: {
        kind: "error",
        code: "LIVEKIT_FAILED",
        message: "语音通话连接失败",
        canFallback: true,
      },
    });
    render(
      <RealtimePanel
        sessionId="s-1"
        personalityId="p-1"
        onFallbackToText={onFallback}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId("realtime-error")).toBeInTheDocument();
    expect(screen.getByTestId("realtime-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("realtime-dismiss")).toBeInTheDocument();
  });

  it("fallback CTA calls onFallbackToText", async () => {
    const user = userEvent.setup();
    const onFallback = vi.fn();
    setRealtimeState({
      state: {
        kind: "error",
        code: "LIVEKIT_FAILED",
        message: "fail",
        canFallback: true,
      },
    });
    render(
      <RealtimePanel
        sessionId="s-1"
        personalityId="p-1"
        onFallbackToText={onFallback}
      />,
    );
    await user.click(screen.getByTestId("realtime-fallback"));
    expect(onFallback).toHaveBeenCalled();
  });
});
