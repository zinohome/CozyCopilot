import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The index.ts dispatch logic runs at module-load time. To exercise each
 * branch we clear the module cache with vi.resetModules(), set the
 * relevant global on `window` (or window.__TAURI_INTERNALS__), then
 * dynamically re-import the module so `selectImpl()` re-runs with the
 * new globals in place.
 *
 * localStorage survives between tests in jsdom, so we clear it explicitly
 * in beforeEach to keep the web-impl assertions deterministic.
 */
describe("storage/index dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    delete (window as { Capacitor?: unknown }).Capacitor;
    localStorage.clear();
  });

  it("selects the web impl when neither Tauri nor Capacitor globals are present", async () => {
    const storage = await import("./index");
    // Web impl uses localStorage (provided by jsdom); prime the store and read it back
    storage.setItem("who", "web");
    expect(storage.getItem("who")).toBe("web");
  });

  it("selects the Tauri impl when window.__TAURI_INTERNALS__ is present", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const storage = await import("./index");
    storage.setItem("who", "tauri");
    expect(storage.getItem("who")).toBe("tauri");
    // The web store should not have been touched — Tauri writes to its own cache.
    expect(localStorage.getItem("who")).toBeNull();
  });

  it("selects the Capacitor impl when window.Capacitor is present (no Tauri)", async () => {
    (window as { Capacitor?: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => "ios",
    };
    const storage = await import("./index");
    storage.setItem("who", "capacitor");
    expect(storage.getItem("who")).toBe("capacitor");
    // The web store should not have been touched — Capacitor writes to its own cache.
    expect(localStorage.getItem("who")).toBeNull();
  });

  it("makeZustandStorage adapter round-trips get/set/remove via the sync Storage interface", async () => {
    const { makeZustandStorage } = await import("./index");
    const zs = makeZustandStorage();
    expect(zs.getItem("k")).toBeNull();
    zs.setItem("k", "v");
    expect(zs.getItem("k")).toBe("v");
    zs.removeItem("k");
    expect(zs.getItem("k")).toBeNull();
  });
});
