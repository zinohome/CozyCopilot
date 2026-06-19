/**
 * M7.4: axe-core component scans.
 *
 * Renders the major component trees in vitest+jsdom and runs axe against
 * the resulting DOM. The matcher (`toHaveNoViolations`) is registered in
 * `src/test/setup.ts` via `vitest-axe/extend-expect`, so every test file
 * gets it for free.
 *
 * Scope (per M7.4 plan): ZERO "critical" or "serious" violations across
 * the major surfaces. "moderate" and "minor" are deferred to M7.5/M8.
 * We filter the results to enforce that scope — `toHaveNoViolations`
 * would fail on any color-contrast miss in jsdom, which the M7.4 brief
 * explicitly says is out of scope (axe can't measure real contrast in a
 * fake layout).
 *
 * Scans:
 *   1. <MessageList> with a few seeded messages
 *   2. <Composer> with default props
 *   3. <SettingsPage> (which mounts the theme section)
 *   4. <ChatWidget> (M6) with a base EmbedConfig
 *   5. <EmbedClient> with the panel open
 *   6. <FloatingBubble> (M6)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";

/** Inferred return shape of `axe(...)` — avoids importing from
 *  `axe-core` directly (not hoisted by pnpm in this repo). */
type AxeResults = Awaited<ReturnType<typeof axe>>;

// M4 chat surfaces --------------------------------------------------------
import { MessageList } from "@/features/chat/MessageList";
import { Composer } from "@/features/chat/Composer";

// Settings page (web app) -------------------------------------------------
import SettingsPage from "@app/(web)/settings/page";

// M6 embed surfaces -------------------------------------------------------
import { ChatWidget } from "@app/(embed)/widget/ChatWidget";
import { EmbedClient } from "@app/(embed)/widget/EmbedClient";
import { FloatingBubble } from "@app/(embed)/widget/FloatingBubble";
// `useEmbedTransport` is used to give ChatWidget a real transport handle
// — the widget's useEffect requires a working `.on(...)` registration.
import { useEmbedTransport } from "@/features/embed/useEmbedTransport";

// Stores we need to pre-seed or reset ------------------------------------
import { useThemeStore } from "@/stores/theme";
import { useSessionStore } from "@/stores/session";
import type { EmbedConfig } from "@/features/embed/useEmbedConfig";

// M6.4: stub the auth hook so the EmbedClient scan doesn't try to fetch
// from the BFF. The M6.2 contract pins the post-auth render to
// ChatWidget, so `status: "authenticated"` is the realistic happy-path
// render. ChatWidget does NOT import this hook, so the mock has no
// effect on the other scans.
vi.mock("@/features/embed/useEmbedAuth", () => ({
  useEmbedAuth: () => ({
    status: "authenticated",
    jwt: "fake-jwt",
    error: null,
  }),
}));

/**
 * Reduce an AxeResults object to only `critical` and `serious`
 * violations. `moderate` and `minor` are tracked in M7.5 / M8.
 */
function criticalViolations(results: AxeResults) {
  return results.violations.filter(
    (v: { impact?: string | null }) => v.impact === "critical" || v.impact === "serious",
  );
}

const baseConfig: EmbedConfig = {
  key: "ck_test",
  personality: "00000000-0000-0000-0000-000000000001",
  theme: "cozy-orange",
  prefill: null,
  hideHistory: false,
  parentOrigin: null,
};

/**
 * Helper: `setSearch` mirrors the helper in `EmbedClient.test.tsx` so
 * the widget's `useEmbedConfig` hook can read a stable query string.
 */
function setSearch(search: string) {
  Object.defineProperty(window, "location", {
    value: { ...window.location, search },
    writable: true,
    configurable: true,
  });
}

describe("M7.4 a11y: component scans", () => {
  beforeEach(() => {
    // The theme and session stores are module-level; reset to defaults
    // so tests don't bleed state into each other.
    useThemeStore.setState({ theme: "cozy-orange", mode: "light" });
    useSessionStore.setState({
      messages: [],
      streamingMessageId: null,
      activeSessionId: null,
      activePersonalityId: null,
    });
    localStorage.clear();
    setSearch("");
    // The embed theme effect writes inline CSS variables to
    // documentElement. Clear them so each test starts from a clean slate.
    document.documentElement.removeAttribute("style");
  });

  it("MessageList: no critical/serious axe violations", async () => {
    const { container } = render(
      <MessageList
        messages={[
          { id: "1", role: "user", content: "hi", status: "done" },
          { id: "2", role: "assistant", content: "hello", status: "done" },
          {
            id: "3",
            role: "assistant",
            content: "still typing…",
            status: "streaming",
          },
        ]}
      />,
    );
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });

  it("Composer: no critical/serious axe violations", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<Composer onSend={onSend} disabled={false} />);
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });

  it("SettingsPage (Theme section): no critical/serious axe violations", async () => {
    const { container } = render(<SettingsPage />);
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });

  it("ChatWidget (M6): no critical/serious axe violations", async () => {
    // Seed two messages so the MessageList inside ChatWidget has content
    // to scan (a fully empty list would also pass, but mirrors real use).
    useSessionStore.setState({
      messages: [
        { id: "1", role: "user", content: "hi", status: "done" },
        { id: "2", role: "assistant", content: "hello", status: "done" },
      ],
    });

    // M6.4: ChatWidget requires a working transport handle so the
    // `useEffect` listeners can register. We mount a real
    // `useEmbedTransport` instance via `renderHook` (the same pattern
    // ChatWidget's own tests use) and pass the resulting object in.
    const { result } = renderHook(() => useEmbedTransport({ parentOrigin: null }));

    const { container } = render(
      <ChatWidget config={baseConfig} onClose={vi.fn()} transport={result.current} />,
    );
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });

  it("EmbedClient (panel open): no critical/serious axe violations", async () => {
    setSearch("?key=ck_test&theme=cozy-orange");
    const { container, getByTestId } = render(<EmbedClient />);

    // Open the panel by clicking the bubble. The mount is the
    // ChatWidget path that real users see.
    const user = userEvent.setup();
    await user.click(getByTestId("floating-bubble"));

    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });

  it("FloatingBubble: no critical/serious axe violations", async () => {
    const { container } = render(<FloatingBubble onClick={vi.fn()} />);
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });
});
