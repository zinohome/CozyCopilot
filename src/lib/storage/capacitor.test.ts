import { describe, it, expect } from "vitest";
import { getItem, setItem, removeItem } from "./capacitor";

/**
 * M3.4 ships the in-memory cache; M3.9 will add the real plugin call.
 * The tests below pin the v1.0 contract: getItem returns whatever was
 * last setItem'd via the cache, and removeItem clears it. Two separate
 * imports share the same module-scoped Map, which is what we want for
 * a singleton store.
 */
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
});
