import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-store", () => {
  return {
    LazyStore: class {
      set = mocks.set;
      delete = mocks.delete;
      save = mocks.save;
    },
  };
});

import { getItem, setItem, removeItem } from "./tauri";

describe("storage/tauri (M3.8 real plugin wiring)", () => {
  let liveTauri = false;

  function setLiveTauri(live: boolean) {
    liveTauri = live;
    if (live) {
      (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
        invoke: () => {},
      };
    } else {
      delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  }

  beforeEach(() => {
    mocks.set.mockClear();
    mocks.delete.mockClear();
    mocks.save.mockClear();
  });

  afterEach(() => {
    // Always clean up the global so other test files in the same Vitest
    // worker do not see a leaked live Tauri runtime.
    setLiveTauri(false);
  });

  it("setItem writes to the sync cache even when Tauri runtime is absent", () => {
    setLiveTauri(false);
    setItem("k", "v");
    expect(getItem("k")).toBe("v");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("setItem fires the real plugin write when Tauri runtime is live", async () => {
    setLiveTauri(true);
    setItem("k2", "v2");
    expect(getItem("k2")).toBe("v2");
    // Wait one microtask for the promise chain
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.set).toHaveBeenCalledWith("k2", "v2");
    expect(mocks.save).toHaveBeenCalled();
  });

  it("removeItem fires the real plugin delete when Tauri runtime is live", async () => {
    setLiveTauri(true);
    setItem("k3", "v3");
    removeItem("k3");
    expect(getItem("k3")).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.delete).toHaveBeenCalledWith("k3");
  });

  it("removeItem is a pure cache clear when Tauri runtime is absent", () => {
    setLiveTauri(false);
    setItem("k4", "v4");
    removeItem("k4");
    expect(getItem("k4")).toBeNull();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("does not leak __TAURI_INTERNALS__ to the next test", () => {
    expect(liveTauri).toBe(false);
    expect(
      (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    ).toBeUndefined();
  });
});
