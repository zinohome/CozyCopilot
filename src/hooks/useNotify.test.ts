import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Mock the notifications module so the hook is exercised in isolation.
vi.mock("@/lib/notifications", () => ({
  requestPermission: vi.fn(),
  getPermission: vi.fn(),
  notify: vi.fn(),
}));

import * as notify from "@/lib/notifications";
import { useNotify } from "./useNotify";

const mockedNotify = vi.mocked(notify);

describe("useNotify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: getPermission returns "default" (matches web in jsdom — no Notification)
    mockedNotify.getPermission.mockReturnValue("default");
    mockedNotify.requestPermission.mockResolvedValue("default");
    mockedNotify.notify.mockImplementation(() => undefined);
  });

  it("starts in initial state (permission: 'default', busy: false)", () => {
    const { result } = renderHook(() => useNotify());

    // Pre-mount: useEffect has not flushed yet
    expect(result.current.permission).toBe("default");
    expect(result.current.busy).toBe(false);
    expect(typeof result.current.request).toBe("function");
    expect(typeof result.current.send).toBe("function");
  });

  it("after mount, permission reflects notify.getPermission() (mock returns 'granted')", async () => {
    mockedNotify.getPermission.mockReturnValue("granted");

    const { result } = renderHook(() => useNotify());

    // Let the mount effect run
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedNotify.getPermission).toHaveBeenCalled();
    expect(result.current.permission).toBe("granted");
  });

  it("request() calls notify.requestPermission() and updates state", async () => {
    mockedNotify.requestPermission.mockResolvedValue("granted");

    const { result } = renderHook(() => useNotify());

    await act(async () => {
      await Promise.resolve();
    });

    let next: string = "";
    await act(async () => {
      next = await result.current.request();
    });

    expect(mockedNotify.requestPermission).toHaveBeenCalled();
    expect(next).toBe("granted");
    expect(result.current.permission).toBe("granted");
    expect(result.current.busy).toBe(false);
  });

  it("send() calls notify.notify() with the given options", () => {
    const { result } = renderHook(() => useNotify());

    const opts = { title: "Hello", body: "World" };
    act(() => {
      result.current.send(opts);
    });

    expect(mockedNotify.notify).toHaveBeenCalledWith(opts);
    expect(mockedNotify.notify).toHaveBeenCalledTimes(1);
  });
});
