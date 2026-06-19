import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { parseEmbedConfig, useEmbedConfig, EMPTY_EMBED_CONFIG } from "./useEmbedConfig";

/**
 * Replace `window.location.search` for the duration of a test. jsdom
 * doesn't let us set `window.location` directly without an explicit
 * `window.location.replace`, so we override the property using
 * `Object.defineProperty` and restore the original in `afterEach`.
 */
function setSearch(search: string) {
  Object.defineProperty(window, "location", {
    value: { ...window.location, search },
    writable: true,
    configurable: true,
  });
}

describe("useEmbedConfig / parseEmbedConfig", () => {
  beforeEach(() => {
    setSearch("");
  });

  afterEach(() => {
    setSearch("");
  });

  describe("parseEmbedConfig (pure parser)", () => {
    it("returns the empty config for null / undefined / empty input (this is what the SSR branch returns)", () => {
      // Real SSR: `window` is `undefined`, so the hook short-circuits
      // to `EMPTY_EMBED_CONFIG`. We can't actually render with no
      // `window` (React needs it), so we verify the parser — which
      // the SSR branch delegates to when given an empty string — does
      // the right thing.
      expect(parseEmbedConfig(null)).toEqual(EMPTY_EMBED_CONFIG);
      expect(parseEmbedConfig(undefined)).toEqual(EMPTY_EMBED_CONFIG);
      expect(parseEmbedConfig("")).toEqual(EMPTY_EMBED_CONFIG);
    });

    it("reads key, personality, and theme from the query string", () => {
      const cfg = parseEmbedConfig("?key=ck_abc&personality=00000000-0000-0000-0000-000000000001&theme=calm-blue");
      expect(cfg.key).toBe("ck_abc");
      expect(cfg.personality).toBe("00000000-0000-0000-0000-000000000001");
      expect(cfg.theme).toBe("calm-blue");
    });

    it("accepts a query string with or without the leading '?'", () => {
      expect(parseEmbedConfig("?key=ck_abc").key).toBe("ck_abc");
      expect(parseEmbedConfig("key=ck_abc").key).toBe("ck_abc");
    });

    it("defaults hideHistory to false when unset", () => {
      expect(parseEmbedConfig("?key=ck_abc").hideHistory).toBe(false);
    });

    it("parses ?hideHistory=1 as true", () => {
      expect(parseEmbedConfig("?hideHistory=1").hideHistory).toBe(true);
    });

    it("parses ?hideHistory=true and ?hideHistory=yes as true", () => {
      expect(parseEmbedConfig("?hideHistory=true").hideHistory).toBe(true);
      expect(parseEmbedConfig("?hideHistory=yes").hideHistory).toBe(true);
    });

    it("treats unknown hideHistory values as false", () => {
      expect(parseEmbedConfig("?hideHistory=0").hideHistory).toBe(false);
      expect(parseEmbedConfig("?hideHistory=off").hideHistory).toBe(false);
    });

    it("reads prefill and parentOrigin", () => {
      const cfg = parseEmbedConfig("?prefill=hello&parentOrigin=https%3A%2F%2Fexample.com");
      expect(cfg.prefill).toBe("hello");
      expect(cfg.parentOrigin).toBe("https://example.com");
    });

    it("falls back to theme 'cozy-orange' when none is supplied", () => {
      expect(parseEmbedConfig("?key=ck_abc").theme).toBe("cozy-orange");
    });

    it("preserves an unknown theme as a free-form string (so custom themes don't break TS)", () => {
      expect(parseEmbedConfig("?theme=midnight-purple").theme).toBe("midnight-purple");
    });
  });

  describe("useEmbedConfig (hook)", () => {
    it("reads the live query string and returns the parsed config", () => {
      setSearch("?key=ck_abc&personality=00000000-0000-0000-0000-000000000001&theme=calm-blue");

      const { result } = renderHook(() => useEmbedConfig());

      expect(result.current.key).toBe("ck_abc");
      expect(result.current.personality).toBe("00000000-0000-0000-0000-000000000001");
      expect(result.current.theme).toBe("calm-blue");
    });

    it("returns the empty config when the URL has no query string (matches the SSR branch output)", () => {
      // The hook's SSR branch returns `EMPTY_EMBED_CONFIG` when
      // `window` is undefined; the client-side branch with an empty
      // search string returns the same shape via the pure parser.
      // Asserting both paths agree keeps the public contract honest.
      setSearch("");

      const { result } = renderHook(() => useEmbedConfig());

      expect(result.current).toEqual(EMPTY_EMBED_CONFIG);
    });

    it("memoizes the result across re-renders", () => {
      setSearch("?key=ck_abc");
      const { result, rerender } = renderHook(() => useEmbedConfig());
      const first = result.current;
      rerender();
      expect(result.current).toBe(first);
    });
  });
});
