import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEmbedTransport } from "./useEmbedTransport";
import type { CozyOutboundMessage } from "./types";

// We can't set `window.parent` to a different reference at the test
// level (jsdom locks it to `window`), so we fake `window.parent` by
// stubbing `window.postMessage`. Each call's `targetOrigin` argument
// is what we want to assert on; the `message` itself is the payload.
//
// For inbound tests we dispatch real `MessageEvent`s on `window` and
// the listener filters by `evt.source === window.parent`. We fake the
// source by overriding `window.parent` on the event object — see
// `makeMessageEvent` below.

function makeMessageEvent<T>(data: T, sourceOverride?: MessageEventSource | null): MessageEvent<T> {
  const evt = new MessageEvent<T>("message", { data });
  // The source filter reads `evt.source`, which is set from the init
  // dictionary but is read-only on the resulting event. Object.defineProperty
  // lets us override it cleanly.
  Object.defineProperty(evt, "source", {
    value: sourceOverride === undefined ? window.parent : sourceOverride,
    configurable: true,
  });
  return evt;
}

describe("useEmbedTransport", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    postMessageSpy = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {
      // No-op — we capture the call args via the spy.
    });
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
  });

  describe("emit", () => {
    it("posts to window.parent with the supplied targetOrigin", () => {
      const { result } = renderHook(() =>
        useEmbedTransport({ parentOrigin: "https://example.com" }),
      );

      act(() => {
        result.current.emit({ type: "cozy:ready", version: "0.1.0" });
      });

      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const [payload, targetOrigin] = postMessageSpy.mock.calls[0] as [
        CozyOutboundMessage,
        string,
      ];
      expect(payload).toEqual({ type: "cozy:ready", version: "0.1.0" });
      expect(targetOrigin).toBe("https://example.com");
    });

    it("falls back to '*' when parentOrigin is null", () => {
      const { result } = renderHook(() => useEmbedTransport({ parentOrigin: null }));

      act(() => {
        result.current.emit({ type: "cozy:ready", version: "0.1.0" });
      });

      const [, targetOrigin] = postMessageSpy.mock.calls[0] as [unknown, string];
      expect(targetOrigin).toBe("*");
    });

    it("holds emits when ready === false (auth not complete)", () => {
      const { result } = renderHook(() =>
        useEmbedTransport({ parentOrigin: "https://example.com", ready: false }),
      );

      act(() => {
        result.current.emit({ type: "cozy:ready", version: "0.1.0" });
      });

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it("returns the same emit identity across renders (memoized)", () => {
      const { result, rerender } = renderHook(() =>
        useEmbedTransport({ parentOrigin: "https://example.com" }),
      );
      const first = result.current.emit;
      rerender();
      expect(result.current.emit).toBe(first);
    });
  });

  describe("on", () => {
    it("invokes the handler when an inbound message matches the type AND source is window.parent", () => {
      const handler = vi.fn();
      const { result } = renderHook(() => useEmbedTransport({ parentOrigin: null }));

      let unsubscribe: () => void = () => undefined;
      act(() => {
        unsubscribe = result.current.on("host:prefill", handler);
      });

      act(() => {
        window.dispatchEvent(
          makeMessageEvent({ type: "host:prefill", content: "Hi" }, window.parent),
        );
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ type: "host:prefill", content: "Hi" });

      unsubscribe();
    });

    it("ignores messages whose source is NOT window.parent", () => {
      const handler = vi.fn();
      const { result } = renderHook(() => useEmbedTransport({ parentOrigin: null }));

      act(() => {
        result.current.on("host:prefill", handler);
      });

      // Forge a foreign window as the source.
      const foreignWindow = { ...window } as Window;
      act(() => {
        window.dispatchEvent(
          makeMessageEvent({ type: "host:prefill", content: "Hi" }, foreignWindow),
        );
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("ignores messages whose type doesn't match the subscribed type", () => {
      const prefillHandler = vi.fn();
      const clearHandler = vi.fn();
      const { result } = renderHook(() => useEmbedTransport({ parentOrigin: null }));

      act(() => {
        result.current.on("host:prefill", prefillHandler);
        result.current.on("host:clear", clearHandler);
      });

      act(() => {
        window.dispatchEvent(
          makeMessageEvent({ type: "host:prefill", content: "Hi" }, window.parent),
        );
      });

      expect(prefillHandler).toHaveBeenCalledTimes(1);
      expect(clearHandler).not.toHaveBeenCalled();
    });

    it("ignores non-object payloads (defensive against arbitrary postMessage data)", () => {
      const handler = vi.fn();
      const { result } = renderHook(() => useEmbedTransport({ parentOrigin: null }));

      act(() => {
        result.current.on("host:prefill", handler);
      });

      act(() => {
        window.dispatchEvent(makeMessageEvent("a string", window.parent));
        window.dispatchEvent(makeMessageEvent(null, window.parent));
        window.dispatchEvent(makeMessageEvent(undefined, window.parent));
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("unsubscribe detaches the handler", () => {
      const handler = vi.fn();
      const { result } = renderHook(() => useEmbedTransport({ parentOrigin: null }));

      let unsubscribe: () => void = () => undefined;
      act(() => {
        unsubscribe = result.current.on("host:prefill", handler);
      });

      act(() => {
        unsubscribe();
        window.dispatchEvent(
          makeMessageEvent({ type: "host:prefill", content: "Hi" }, window.parent),
        );
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("supports multiple subscribers on the same type", () => {
      const a = vi.fn();
      const b = vi.fn();
      const { result } = renderHook(() => useEmbedTransport({ parentOrigin: null }));

      act(() => {
        result.current.on("host:prefill", a);
        result.current.on("host:prefill", b);
      });

      act(() => {
        window.dispatchEvent(
          makeMessageEvent({ type: "host:prefill", content: "Hi" }, window.parent),
        );
      });

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });
  });
});
