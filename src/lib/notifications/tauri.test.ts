import { describe, it, expect, afterEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: mocks.isPermissionGranted,
  requestPermission: mocks.requestPermission,
  sendNotification: mocks.sendNotification,
}));

import { getPermission, requestPermission, notify } from "./tauri";

describe("notifications/tauri (M3.8 real plugin wiring)", () => {
  function setLiveTauri(live: boolean) {
    if (live) {
      (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
        invoke: () => {},
      };
    } else {
      delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  }

  afterEach(() => {
    // Always clean up the global so other test files in the same Vitest
    // worker do not see a leaked live Tauri runtime.
    setLiveTauri(false);
    mocks.isPermissionGranted.mockReset();
    mocks.requestPermission.mockReset();
    mocks.sendNotification.mockReset();
  });

  it("getPermission returns 'unsupported' when window.__TAURI_INTERNALS__ is absent", () => {
    setLiveTauri(false);
    expect(getPermission()).toBe("unsupported");
  });

  it("getPermission returns 'default' when window.__TAURI_INTERNALS__ is present (sync surface)", () => {
    setLiveTauri(true);
    expect(getPermission()).toBe("default");
  });

  it("requestPermission returns 'unsupported' when no live Tauri runtime", async () => {
    setLiveTauri(false);
    await expect(requestPermission()).resolves.toBe("unsupported");
    expect(mocks.isPermissionGranted).not.toHaveBeenCalled();
  });

  it("requestPermission returns 'granted' when the plugin reports granted", async () => {
    setLiveTauri(true);
    mocks.isPermissionGranted.mockResolvedValue(true);
    await expect(requestPermission()).resolves.toBe("granted");
  });

  it("requestPermission returns the plugin's response when not yet granted", async () => {
    setLiveTauri(true);
    mocks.isPermissionGranted.mockResolvedValue(false);
    mocks.requestPermission.mockResolvedValue("granted");
    await expect(requestPermission()).resolves.toBe("granted");
    expect(mocks.requestPermission).toHaveBeenCalled();
  });

  it("requestPermission swallows plugin errors and returns 'default'", async () => {
    setLiveTauri(true);
    mocks.isPermissionGranted.mockRejectedValue(new Error("boom"));
    await expect(requestPermission()).resolves.toBe("default");
  });

  it("notify is a no-op when no live Tauri runtime", () => {
    setLiveTauri(false);
    notify({ title: "Hello" });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("notify calls sendNotification when Tauri runtime is live", () => {
    setLiveTauri(true);
    notify({ title: "Hello", body: "World" });
    expect(mocks.sendNotification).toHaveBeenCalledWith({
      title: "Hello",
      body: "World",
    });
  });

  it("notify swallows plugin errors", () => {
    setLiveTauri(true);
    mocks.sendNotification.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => notify({ title: "Hello" })).not.toThrow();
  });
});
