import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The index.ts dispatch logic runs at module-load time. To exercise
 * each branch we clear the module cache with vi.resetModules(), set
 * the relevant global on `window`, then dynamically re-import the
 * module so `selectImpl()` re-runs with the new globals in place.
 */
describe("notifications/index dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete (globalThis as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
    delete (window as { Capacitor?: unknown }).Capacitor;
  });

  it("selects web impl when no platform global is present (getPermission returns 'unsupported')", async () => {
    // jsdom's window has neither Tauri nor Capacitor, and
    // window.Notification is absent too -> web's getPermission returns 'unsupported'
    const notifs = await import("./index");
    expect(notifs.getPermission()).toBe("unsupported");
  });

  it("selects tauri impl when window.__TAURI_INTERNALS__ is present (getPermission returns 'default')", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const notifs = await import("./index");
    expect(notifs.getPermission()).toBe("default");
  });

  it("selects capacitor impl when window.Capacitor is present (getPermission returns 'default')", async () => {
    (window as { Capacitor?: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => "ios",
    };
    const notifs = await import("./index");
    expect(notifs.getPermission()).toBe("default");
  });

  it("selects web impl on SSR (typeof window === 'undefined')", async () => {
    const originalWindow = globalThis.window;
    // Simulate SSR by removing the window global before the module loads
    delete (globalThis as { window?: unknown }).window;
    try {
      const notifs = await import("./index");
      // The web fallback returns 'unsupported' for everything in SSR
      expect(notifs.getPermission()).toBe("unsupported");
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});
