import { describe, it, expect, vi } from "vitest";
import { getItem, setItem, removeItem } from "./capacitor";

/**
 * M3.9 wires up the real `@capacitor/preferences` plugin (UserDefaults
 * on iOS, SharedPreferences on Android). The plugin's API is async;
 * the storage abstraction exposes a sync surface backed by a
 * module-scoped Map (see src/lib/storage/capacitor.ts for the design
 * note). We mock the plugin here so the tests stay deterministic.
 */
vi.mock("@capacitor/core", () => ({}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  },
}));

describe("storage/capacitor", () => {
  it("getItem returns the value set via setItem (in-memory cache)", () => {
    setItem("k", "v");
    expect(getItem("k")).toBe("v");
  });

  it("removeItem clears the cached value", () => {
    setItem("k", "v");
    removeItem("k");
    expect(getItem("k")).toBeNull();
  });

  it("two separate module imports share the same cache (singleton Map)", async () => {
    // The first import already populated the cache; the second should see it.
    setItem("shared", "yes");
    const fresh = await import("./capacitor");
    expect(fresh.getItem("shared")).toBe("yes");
  });

  it("setItem fires a fire-and-forget Preferences.set call", async () => {
    const { Preferences } = await import("@capacitor/preferences");
    (Preferences.set as ReturnType<typeof vi.fn>).mockClear();
    setItem("persisted", "value");
    // Drain the microtask queue so the void Preferences.set promise resolves
    await Promise.resolve();
    expect(Preferences.set).toHaveBeenCalledWith({ key: "persisted", value: "value" });
  });

  it("removeItem fires a fire-and-forget Preferences.remove call", async () => {
    const { Preferences } = await import("@capacitor/preferences");
    (Preferences.remove as ReturnType<typeof vi.fn>).mockClear();
    setItem("k", "v");
    removeItem("k");
    await Promise.resolve();
    expect(Preferences.remove).toHaveBeenCalledWith({ key: "k" });
  });
});
