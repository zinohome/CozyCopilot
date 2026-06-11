import { describe, it, expect, afterEach } from "vitest";
import { getPermission, requestPermission, notify } from "./tauri";

describe("notifications/tauri", () => {
  afterEach(() => {
    delete (globalThis as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
  });

  it("getPermission returns 'unsupported' when window.__TAURI_INTERNALS__ is absent", () => {
    expect(getPermission()).toBe("unsupported");
  });

  it("getPermission returns 'default' when window.__TAURI_INTERNALS__ is present", () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    expect(getPermission()).toBe("default");
  });

  it("requestPermission returns 'unsupported' when window.__TAURI_INTERNALS__ is absent", async () => {
    await expect(requestPermission()).resolves.toBe("unsupported");
  });

  it("requestPermission returns 'default' when window.__TAURI_INTERNALS__ is present", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    await expect(requestPermission()).resolves.toBe("default");
  });

  it("notify is a no-op when window.__TAURI_INTERNALS__ is absent", () => {
    // Should not throw
    notify({ title: "Hello" });
  });

  it("notify is a no-op when window.__TAURI_INTERNALS__ is present (M3.8 stub)", () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    // M3.8 will replace with real sendNotification; for M3.3 the body is empty
    notify({ title: "Hello", body: "World" });
  });
});
