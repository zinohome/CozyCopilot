import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The index.ts dispatch logic runs at module-load time. To exercise each
 * branch we clear the module cache with vi.resetModules(), set the
 * relevant global on `window`, then dynamically re-import the module so
 * `selectImpl()` re-runs with the new globals in place.
 */
describe("capabilities/index dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    delete (window as { Capacitor?: unknown }).Capacitor;
  });

  it("selects Tauri impl when window.__TAURI_INTERNALS__ is present", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const caps = await import("./index");
    expect(caps.isNativeApp).toBe(true);
    // Tauri impl should report one of the tauri-* platforms
    expect(caps.getPlatform()).toMatch(/^tauri-/);
  });

  it("selects Capacitor impl when window.Capacitor is present (no Tauri)", async () => {
    (window as { Capacitor?: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => "ios",
    };
    const caps = await import("./index");
    expect(caps.isNativeApp).toBe(true);
    expect(caps.getPlatform()).toBe("ios");
  });

  it("selects web impl when neither global is present", async () => {
    const caps = await import("./index");
    expect(caps.isNativeApp).toBe(false);
    expect(["web", "embed"]).toContain(caps.getPlatform());
  });

  it("selects web impl on SSR (typeof window === 'undefined')", async () => {
    const originalWindow = globalThis.window;
    // Simulate SSR by removing the window global before the module loads
    delete (globalThis as { window?: unknown }).window;
    try {
      const caps = await import("./index");
      expect(caps.isNativeApp).toBe(false);
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});
