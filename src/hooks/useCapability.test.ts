import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Mock the capability module so the hook is exercised in isolation.
vi.mock("@/lib/capabilities", () => ({
  checkMicrophonePermission: vi.fn(),
  requestMicrophonePermission: vi.fn(),
  isNativeApp: false,
  getPlatform: () => "web",
}));

import * as cap from "@/lib/capabilities";
import { useCapability } from "./useCapability";

const mockedCap = vi.mocked(cap);

describe("useCapability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: checkMicrophonePermission resolves to "prompt"
    mockedCap.checkMicrophonePermission.mockResolvedValue("prompt");
  });

  it("starts in initial state (micPermission: 'prompt', loading: true, isNativeApp: false, platform: 'web')", async () => {
    const { result } = renderHook(() => useCapability());

    // Drain pending microtasks so the mount effect's state updates land
    // before we assert.
    await act(async () => {
      await Promise.resolve();
    });

    // The initial render state (pre-effect) used "prompt" / true. After
    // mount, loading flips to false but the value returned by the mock
    // is also "prompt", so micPermission stays "prompt".
    expect(result.current.micPermission).toBe("prompt");
    expect(result.current.loading).toBe(false);
    expect(result.current.isNativeApp).toBe(false);
    expect(result.current.platform).toBe("web");
    expect(typeof result.current.refresh).toBe("function");
  });

  it("after mount, loading becomes false and micPermission reflects checkMicrophonePermission() (jsdom returns 'prompt')", async () => {
    const { result } = renderHook(() => useCapability());

    // Wait for the mount effect to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedCap.checkMicrophonePermission).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.micPermission).toBe("prompt");
  });

  it("refresh() triggers another checkMicrophonePermission() call and updates state", async () => {
    // First call returns 'prompt'
    mockedCap.checkMicrophonePermission.mockResolvedValueOnce("prompt");
    const { result } = renderHook(() => useCapability());

    // Let the initial mount-effect finish
    await act(async () => {
      await Promise.resolve();
    });

    const callsAfterMount = mockedCap.checkMicrophonePermission.mock.calls.length;
    expect(result.current.micPermission).toBe("prompt");
    expect(result.current.loading).toBe(false);

    // Second call resolves to 'granted'
    mockedCap.checkMicrophonePermission.mockResolvedValueOnce("granted");
    await act(async () => {
      await result.current.refresh();
    });

    expect(mockedCap.checkMicrophonePermission.mock.calls.length).toBe(callsAfterMount + 1);
    expect(result.current.micPermission).toBe("granted");
    expect(result.current.loading).toBe(false);
  });

  it("isNativeApp and platform are stable across renders (don't change on refresh)", async () => {
    const { result, rerender } = renderHook(() => useCapability());

    const initialIsNativeApp = result.current.isNativeApp;
    const initialPlatform = result.current.platform;

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.isNativeApp).toBe(initialIsNativeApp);
    expect(result.current.platform).toBe(initialPlatform);

    rerender();
    expect(result.current.isNativeApp).toBe(initialIsNativeApp);
    expect(result.current.platform).toBe(initialPlatform);
  });
});
