/**
 * M7.5: keyboard navigation audit.
 *
 * Exercises the keyboard contracts the components promise:
 *   - <Composer>: Enter sends, Shift+Enter inserts newline, textarea
 *     is reachable and labeled.
 *   - <Composer>: send button has an accessible name.
 *   - <MessageList>: the streaming message announces updates via
 *     `aria-live="polite"`.
 *   - <ThemePicker>: Escape closes the popover AND returns focus to
 *     the trigger; Tab cycles through the 5 swatches.
 *   - <ChatWidget>: when the panel opens, focus lands on the close
 *     button; when it closes, focus returns to the bubble trigger.
 *   - <FloatingBubble>: has aria-label "open-chat" and
 *     `aria-expanded="false"` initially (closes dialog, not list).
 *   - <LoginForm>: every input has an associated label (verified via
 *     getByLabelText, which the axe scan also exercises end-to-end).
 *
 * Uses `@testing-library/user-event` for keyboard interactions
 * (`userEvent.tab()`, `userEvent.keyboard("{Escape}")`) and
 * `screen.getByRole(...)` for queries that respect aria-label. The
 * focus-restoration tests run with `vi.useFakeTimers()` off — focus
 * moves are synchronous in jsdom and the EmbedClient uses
 * `queueMicrotask` for the post-close restore, which we flush with
 * `await Promise.resolve()`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// M4 chat surfaces --------------------------------------------------------
import { Composer } from "@/features/chat/Composer";
import { MessageList } from "@/features/chat/MessageList";

// M7.2 theme surfaces -----------------------------------------------------
import { ThemePicker } from "@/components/theme/ThemePicker";
import { useThemeStore } from "@/stores/theme";

// M6 embed surfaces -------------------------------------------------------
import { ChatWidget } from "@app/(embed)/widget/ChatWidget";
import { EmbedClient } from "@app/(embed)/widget/EmbedClient";
import { FloatingBubble } from "@app/(embed)/widget/FloatingBubble";
import { useEmbedTransport } from "@/features/embed/useEmbedTransport";

// Auth form (label association) -----------------------------------------
import { LoginForm } from "@/features/auth/LoginForm";

// Stores we need to reset ------------------------------------------------
import { useSessionStore } from "@/stores/session";
import type { EmbedConfig } from "@/features/embed/useEmbedConfig";

// M6.4: stub auth so EmbedClient's post-auth effect doesn't try to
// fetch from the BFF. ChatWidget doesn't import this hook, so the mock
// only affects EmbedClient's ready-emission side effect.
vi.mock("@/features/embed/useEmbedAuth", () => ({
  useEmbedAuth: () => ({
    status: "authenticated",
    jwt: "fake-jwt",
    error: null,
  }),
}));

const baseConfig: EmbedConfig = {
  key: "ck_test",
  personality: "00000000-0000-0000-0000-000000000001",
  theme: "cozy-orange",
  prefill: null,
  hideHistory: false,
  parentOrigin: null,
};

function setSearch(search: string) {
  Object.defineProperty(window, "location", {
    value: { ...window.location, search },
    writable: true,
    configurable: true,
  });
}

describe("M7.5 a11y: keyboard navigation", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "cozy-orange", mode: "light" });
    useSessionStore.setState({
      messages: [],
      streamingMessageId: null,
      activeSessionId: null,
      activePersonalityId: null,
    });
    localStorage.clear();
    setSearch("");
    document.documentElement.removeAttribute("style");
  });

  // ---------------------------------------------------------------------
  // <Composer>
  // ---------------------------------------------------------------------
  describe("<Composer>", () => {
    it("pressing Enter sends, Shift+Enter inserts a newline (does not send)", async () => {
      const onSend = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<Composer onSend={onSend} disabled={false} />);

      const input = screen.getByRole("textbox", { name: /message/i });
      await user.type(input, "hello");
      await user.keyboard("{Enter}");
      expect(onSend).toHaveBeenCalledWith("hello");
      onSend.mockClear();

      // Shift+Enter should not call onSend.
      await user.type(input, "a{Shift>}{Enter}{/Shift}b");
      expect(onSend).not.toHaveBeenCalled();
    });

    it("the textarea is labeled 'Message' and the send button has aria-label 'Send message'", () => {
      render(<Composer onSend={vi.fn().mockResolvedValue(undefined)} disabled={false} />);
      // The textarea is associated via `aria-label`, not a visible
      // <label>, so we look it up by accessible name.
      expect(screen.getByRole("textbox", { name: /message/i })).toBeInTheDocument();
      // The send button's visible text is "发送"; its aria-label
      // "Send message" takes precedence for screen readers.
      expect(screen.getByRole("button", { name: /send message/i })).toBeInTheDocument();
    });

    it("the textarea's aria-describedby points to a help text element", () => {
      render(<Composer onSend={vi.fn().mockResolvedValue(undefined)} disabled={false} />);
      const input = screen.getByRole("textbox", { name: /message/i });
      const describedBy = input.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const helpText = document.getElementById(describedBy!);
      expect(helpText).not.toBeNull();
      // The help text is `sr-only` (visually hidden) but readable.
      expect(helpText!.className).toContain("sr-only");
    });
  });

  // ---------------------------------------------------------------------
  // <MessageList>
  // ---------------------------------------------------------------------
  describe("<MessageList>", () => {
    it("the streaming message container has aria-live='polite'", () => {
      render(
        <MessageList
          messages={[
            { id: "1", role: "user", content: "hi", status: "done" },
            { id: "2", role: "assistant", content: "still typing…", status: "streaming" },
          ]}
        />,
      );
      const streaming = screen.getByTestId("message-assistant-streaming");
      expect(streaming).toHaveAttribute("aria-live", "polite");
    });

    it("non-streaming messages do NOT have aria-live", () => {
      render(
        <MessageList
          messages={[{ id: "1", role: "user", content: "hi", status: "done" }]}
        />,
      );
      const done = screen.getByTestId("message-user-done");
      expect(done.getAttribute("aria-live")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // <ThemePicker>
  // ---------------------------------------------------------------------
  describe("<ThemePicker>", () => {
    it("Escape closes the popover AND returns focus to the trigger", async () => {
      const user = userEvent.setup();
      render(<ThemePicker />);

      const trigger = screen.getByTestId("theme-picker-trigger");
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      await user.click(trigger);
      // Popover open — focus moves to the first swatch.
      expect(screen.getByTestId("theme-picker-popover")).toBeInTheDocument();
      expect(document.activeElement).toBe(
        screen.getByTestId("theme-picker-cozy-orange"),
      );

      await user.keyboard("{Escape}");

      // Popover closes, focus returns to the trigger.
      expect(screen.queryByTestId("theme-picker-popover")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it("Tab cycles through all 5 swatches in order", async () => {
      const user = userEvent.setup();
      render(<ThemePicker />);

      await user.click(screen.getByTestId("theme-picker-trigger"));

      // Focus is already on the first swatch (the M7.5 open-focus
      // behavior). Each Tab moves to the next.
      expect(document.activeElement).toBe(
        screen.getByTestId("theme-picker-cozy-orange"),
      );
      await user.tab();
      expect(document.activeElement).toBe(
        screen.getByTestId("theme-picker-calm-blue"),
      );
      await user.tab();
      expect(document.activeElement).toBe(screen.getByTestId("theme-picker-mint"));
      await user.tab();
      expect(document.activeElement).toBe(
        screen.getByTestId("theme-picker-lavender"),
      );
      await user.tab();
      expect(document.activeElement).toBe(screen.getByTestId("theme-picker-mono"));
    });
  });

  // ---------------------------------------------------------------------
  // <ChatWidget> + <EmbedClient>
  // ---------------------------------------------------------------------
  describe("<ChatWidget> / <EmbedClient>", () => {
    it("ChatWidget: on mount, focus moves to the close button", async () => {
      const { result } = renderHook(() => useEmbedTransport({ parentOrigin: null }));
      render(
        <ChatWidget config={baseConfig} onClose={vi.fn()} transport={result.current} />,
      );

      // The focus move happens in a useEffect that runs after paint;
      // flush with a microtask tick.
      await act(async () => {
        await Promise.resolve();
      });

      const closeButton = screen.getByTestId("chat-widget-close");
      expect(document.activeElement).toBe(closeButton);
    });

    it("EmbedClient: when the bubble is clicked, focus moves into the panel (close button)", async () => {
      setSearch("?key=ck_test&theme=cozy-orange");
      const user = userEvent.setup();
      render(<EmbedClient />);

      const bubble = screen.getByTestId("floating-bubble");
      bubble.focus();
      expect(document.activeElement).toBe(bubble);

      await user.click(bubble);

      // The panel is open, focus is on the close button.
      await act(async () => {
        await Promise.resolve();
      });
      expect(document.activeElement).toBe(screen.getByTestId("chat-widget-close"));
    });

    it("EmbedClient: when the panel closes, focus returns to the bubble trigger", async () => {
      setSearch("?key=ck_test&theme=cozy-orange");
      const user = userEvent.setup();
      render(<EmbedClient />);

      const bubble = screen.getByTestId("floating-bubble");
      await user.click(bubble);
      // Wait for the open-side focus move.
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("chat-widget")).toBeInTheDocument();

      await user.click(screen.getByTestId("chat-widget-close"));

      // After close, the bubble remounts and the EmbedClient restores
      // focus to the pre-open element (the bubble itself).
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("floating-bubble")).toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByTestId("floating-bubble"));
    });

    it("FloatingBubble: has aria-label 'open-chat' and aria-expanded='false' initially", () => {
      render(<FloatingBubble onClick={vi.fn()} />);
      const bubble = screen.getByTestId("floating-bubble");
      expect(bubble).toHaveAttribute("aria-label", "open-chat");
      expect(bubble).toHaveAttribute("aria-expanded", "false");
      expect(bubble).toHaveAttribute("aria-haspopup", "dialog");
    });
  });

  // ---------------------------------------------------------------------
  // <LoginForm> (label association)
  // ---------------------------------------------------------------------
  describe("<LoginForm> label association", () => {
    it("every input is reachable via getByLabelText", () => {
      render(<LoginForm onSubmit={vi.fn().mockResolvedValue(undefined)} />);
      // getByLabelText throws if the input is not associated with a
      // <label> (or aria-label / aria-labelledby). Both email and
      // password inputs are linked via <label htmlFor=...>.
      expect(screen.getByLabelText(/邮箱/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/密码/i)).toBeInTheDocument();
    });
  });
});
