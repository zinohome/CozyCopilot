import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getItem, setItem, removeItem } from "./web";

/**
 * jsdom does provide a localStorage object, but we replace it with a
 * minimal mock so each test starts from a known empty state and we can
 * prove the wrapper delegates to the underlying object.
 */
describe("storage/web", () => {
  let store: Map<string, string>;
  let mock: Storage;

  beforeEach(() => {
    store = new Map<string, string>();
    mock = {
      getItem: vi.fn((k: string) => (store.has(k) ? (store.get(k) as string) : null)),
      setItem: vi.fn((k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: vi.fn((k: string) => {
        store.delete(k);
      }),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };
    vi.stubGlobal("localStorage", mock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getItem returns the value previously set via setItem", () => {
    setItem("k", "v");
    expect(getItem("k")).toBe("v");
  });

  it("getItem returns null for a missing key", () => {
    expect(getItem("missing")).toBeNull();
  });

  it("setItem overwrites an existing value", () => {
    setItem("k", "v1");
    setItem("k", "v2");
    expect(getItem("k")).toBe("v2");
  });

  it("removeItem deletes the key", () => {
    setItem("k", "v");
    removeItem("k");
    expect(getItem("k")).toBeNull();
  });
});
