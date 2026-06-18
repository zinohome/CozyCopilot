import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock `useRealtime` so the panel is exercised against a controllable state
// machine without spinning up the livekit-client module.
const useRealtimeMock = vi.fn();

vi.mock("./useRealtime", () => ({
  useRealtime: (...args: unknown[]) => useRealtimeMock(...args),
}));

import { RealtimePanel } from "./RealtimePanel";
import { useAuthStore } from "@/stores/auth";

function setRealtimeState(state: object) {
  useRealtimeMock.mockReturnValue({
    state,
    start: vi.fn().mockResolvedValue(undefined),
    setMicEnabled: vi.fn().mockResolvedValue(undefined),
    hangup: vi.fn().mockResolvedValue(undefined),
    lastSummary: null,
  });
}

describe("RealtimePanel — M5.7 failure-degradation CTA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ jwt: "test-jwt", userId: "u-1", email: "a@b.c", role: "user" });
  });

  it("renders the fallback CTA when error.canFallback is true", () => {
    setRealtimeState({
      kind: "error",
      code: "LIVEKIT_FAILED",
      message: "语音通话连接失败",
      canFallback: true,
    });
    render(
      <RealtimePanel
        sessionId="s-1"
        personalityId="p-1"
        onFallback={vi.fn()}
      />,
    );
    const cta = screen.getByTestId("realtime-fallback");
    expect(cta).toBeInTheDocument();
    // Prominent styling — must use the accent token.
    expect(cta.className).toMatch(/bg-accent/);
    expect(cta.className).toMatch(/text-accent-fg/);
  });

  it("clicking the fallback CTA invokes onFallback", async () => {
    const user = userEvent.setup();
    const onFallback = vi.fn();
    setRealtimeState({
      kind: "error",
      code: "LIVEKIT_FAILED",
      message: "语音通话连接失败",
      canFallback: true,
    });
    render(
      <RealtimePanel
        sessionId="s-1"
        personalityId="p-1"
        onFallback={onFallback}
      />,
    );
    await user.click(screen.getByTestId("realtime-fallback"));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("does NOT render the fallback CTA when error.canFallback is false", () => {
    setRealtimeState({
      kind: "error",
      code: "MIC_DENIED",
      message: "请在浏览器设置中允许麦克风权限",
      canFallback: false,
    });
    render(
      <RealtimePanel
        sessionId="s-1"
        personalityId="p-1"
        onFallback={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("realtime-fallback")).not.toBeInTheDocument();
    // Dismiss button is still available so the user can exit the panel.
    expect(screen.getByTestId("realtime-dismiss")).toBeInTheDocument();
  });
});
