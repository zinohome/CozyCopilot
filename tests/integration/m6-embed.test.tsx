// M6.9 — Embed widget end-to-end integration test.
//
// Loads the EmbedClient into a jsdom window with a mocked `parent`
// (via window.postMessage spy), then exercises the full postMessage
// contract:
//
//   1. With ?key=ck_... set:
//      - useEmbedAuth POSTs to /api/cozy/auth/embed-token (mocked)
//      - The JWT lands in useAuthStore
//      - EmbedClient emits {type: "cozy:ready", version: "0.1.0"} to
//        window.parent
//   2. The host dispatches {type: "host:prefill", content: "Hi"} via
//      postMessage to the widget's window.
//      - The widget's Composer becomes controlled and shows "Hi"
//   3. The user types (or prefill is set), then clicks send.
//      - The widget emits {type: "cozy:session_started", ...} exactly
//        once to window.parent
//   4. The host dispatches {type: "host:set_personality", personality:
//      "p-2"}. The widget's session store picks up the new personality.
//
// We mock the parent↔iframe transport by spying on window.postMessage,
// NOT by swapping `window.parent`. This is what `useEmbedTransport`
// uses for outbound; we capture and assert on the spy.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmbedClient } from "../../app/(embed)/widget/EmbedClient";
import { useAuthStore } from "../../src/stores/auth";
import type {
  CozyOutboundMessage,
  CozyInboundMessage,
} from "../../src/features/embed/types";

// Key matching the regex in route.ts (^ck_[A-Za-z0-9]{32}$).
const VALID_KEY = "ck_" + "abcdef0123456789ABCDEF0123456789";

function setSearch(search: string) {
  Object.defineProperty(window, "location", {
    value: { ...window.location, search },
    writable: true,
    configurable: true,
  });
}

/**
 * Helper: dispatch a fake inbound postMessage to the widget's window
 * (simulating the host page calling `iframe.contentWindow.postMessage(...)`).
 *
 * The transport's `evt.source === window.parent` gate means we must
 * pass `window` as the source — in production the host page IS the
 * parent, so this matches. In jsdom, `window.parent === window` so
 * this also matches.
 */
function dispatchInbound(msg: CozyInboundMessage) {
  const evt = new MessageEvent("message", { data: msg, source: window });
  window.dispatchEvent(evt);
}

/**
 * Helper: pull all CozyOutboundMessages emitted during a test out of the
 * postMessage spy.
 */
function collectEmitted(spy: ReturnType<typeof vi.spyOn>): CozyOutboundMessage[] {
  return spy.mock.calls
    .map((call) => call[0])
    .filter(
      (msg): msg is CozyOutboundMessage =>
        msg != null &&
        typeof msg === "object" &&
        "type" in msg &&
        typeof (msg as { type: unknown }).type === "string" &&
        ((msg as { type: string }).type.startsWith("cozy:") ||
          (msg as { type: string }).type.startsWith("host:")),
    );
}

describe("embed widget end-to-end (M6.9)", () => {
  let postSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setSearch(`?key=${VALID_KEY}&personality=p-1&theme=cozy-orange`);
    document.documentElement.removeAttribute("style");

    useAuthStore.setState({ jwt: "", userId: "", email: "", role: "" });

    // Mock the parent-facing transport. useEmbedTransport.emit calls
    // window.parent.postMessage(msg, targetOrigin). window.parent in
    // jsdom is `window` itself, so a spy on window.postMessage captures
    // both directions.
    postSpy = vi.spyOn(window, "postMessage").mockImplementation(() => undefined);

    // Mock the embed-token BFF. We use vi.fn() + vi.spyOn(globalThis, "fetch")
    // to avoid the strict fetch overload typing; the assertion only needs
    // `mock.calls` shape, not the exact signature.
    fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          data: { jwt: "embed-jwt", userId: "u-1", email: "embed@x", role: "user" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchSpy as unknown as typeof fetch);
  });

  afterEach(() => {
    postSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("emits cozy:ready after the BFF exchanges the key", async () => {
    render(<EmbedClient />);

    // Wait for the auth fetch + cozy:ready emit.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const emitted = collectEmitted(postSpy);
    const ready = emitted.find((m) => m.type === "cozy:ready");
    expect(ready).toBeDefined();
    expect(ready).toMatchObject({ type: "cozy:ready", version: "0.1.0" });

    // Auth store got the JWT.
    expect(useAuthStore.getState().jwt).toBe("embed-jwt");
    expect(useAuthStore.getState().userId).toBe("u-1");

    // BFF was called with the key.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/api/cozy/auth/embed-token");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ key: VALID_KEY });
  });

  it("applies host:prefill to the composer after the panel opens", async () => {
    render(<EmbedClient />);

    // Open the panel.
    await userEvent.click(screen.getByTestId("floating-bubble"));

    // Wait for ChatWidget's useEffect to register the host:* listeners.
    // The effect runs synchronously after the first paint, so a microtask
    // drain is sufficient.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Host sends a prefill message.
    await act(async () => {
      dispatchInbound({ type: "host:prefill", content: "Hello from host" });
    });

    // The composer textarea reflects the prefilled text.
    const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(composer.value).toBe("Hello from host");
  });

  it("emits cozy:session_started when the user sends a message", async () => {
    render(<EmbedClient />);
    await userEvent.click(screen.getByTestId("floating-bubble"));

    // Wait for ChatWidget's listener registration useEffect to settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Type and send.
    const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(composer, "Hi from widget");
    await userEvent.keyboard("{Enter}");

    const emitted = collectEmitted(postSpy);
    const started = emitted.filter((m) => m.type === "cozy:session_started");
    // Exactly once even if we send multiple messages (M6.4 contract).
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      type: "cozy:session_started",
      personalityId: "p-1",
    });
    expect(typeof (started[0] as { sessionId: string }).sessionId).toBe("string");
  });

  it("updates activePersonality on host:set_personality", async () => {
    const { useSessionStore } = await import("../../src/stores/session");
    render(<EmbedClient />);
    await userEvent.click(screen.getByTestId("floating-bubble"));

    // Wait for ChatWidget's listener registration useEffect to settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Seed the store with a starting personality so we can detect the swap.
    act(() => {
      useSessionStore.getState().setActivePersonality("p-1");
    });

    // Host swaps the personality.
    await act(async () => {
      dispatchInbound({ type: "host:set_personality", personality: "p-2" });
    });

    // The session store's activePersonalityId is p-2.
    expect(useSessionStore.getState().activePersonalityId).toBe("p-2");
  });
});