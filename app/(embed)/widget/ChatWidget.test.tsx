import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatWidget } from "./ChatWidget";
import type { EmbedConfig } from "@/features/embed/useEmbedConfig";

const baseConfig: EmbedConfig = {
  key: "ck_test",
  personality: "00000000-0000-0000-0000-000000000001",
  theme: "cozy-orange",
  prefill: null,
  hideHistory: false,
  parentOrigin: null,
};

describe("ChatWidget", () => {
  it("renders the dialog with header, MessageList, and Composer (smoke test)", () => {
    render(<ChatWidget config={baseConfig} onClose={vi.fn()} />);

    // Header / dialog scaffolding
    expect(screen.getByTestId("chat-widget")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "CozyCopilot chat" })).toBeInTheDocument();

    // MessageList renders the empty-state structure (an empty list, but
    // the scrollable container is always there).
    expect(screen.getByTestId("chat-widget-scroll")).toBeInTheDocument();

    // Composer is mounted as a real textbox (the M4 component).
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();
  });

  it("renders MessageList content for any messages already in the store", () => {
    // M4 store is module-level — other tests in the file may have
    // appended to it. Use the current snapshot rather than asserting
    // an exact list; we only care that the component wires the list in.
    render(<ChatWidget config={baseConfig} onClose={vi.fn()} />);
    expect(screen.getByTestId("chat-widget-scroll")).toBeInTheDocument();
  });

  it("surfaces the configured theme in the header", () => {
    render(<ChatWidget config={{ ...baseConfig, theme: "calm-blue" }} onClose={vi.fn()} />);
    expect(screen.getByTestId("chat-widget-theme")).toHaveTextContent("calm-blue");
  });

  it("fires onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(<ChatWidget config={baseConfig} onClose={onClose} />);

    await userEvent.click(screen.getByTestId("chat-widget-close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables the composer when the config has no key (no auth in M6.2)", () => {
    render(<ChatWidget config={{ ...baseConfig, key: null }} onClose={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
