import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmbedClient } from "./EmbedClient";

/**
 * Helper: replace `window.location.search` for the duration of a
 * single test. Mirrors the helper in useEmbedConfig.test.tsx so each
 * test file is independently runnable.
 */
function setSearch(search: string) {
  Object.defineProperty(window, "location", {
    value: { ...window.location, search },
    writable: true,
    configurable: true,
  });
}

describe("EmbedClient", () => {
  beforeEach(() => {
    setSearch("");
  });

  afterEach(() => {
    setSearch("");
  });

  it("mounts FloatingBubble initially (closed state)", () => {
    render(<EmbedClient />);
    expect(screen.getByTestId("floating-bubble")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-widget")).not.toBeInTheDocument();
  });

  it("unmounts the bubble and mounts ChatWidget when the bubble is clicked", async () => {
    render(<EmbedClient />);
    expect(screen.getByTestId("floating-bubble")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("floating-bubble"));

    // Bubble and panel are NEVER both mounted (per the brief).
    expect(screen.queryByTestId("floating-bubble")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-widget")).toBeInTheDocument();
  });

  it("returns to the bubble when ChatWidget's close button is clicked", async () => {
    render(<EmbedClient />);
    await userEvent.click(screen.getByTestId("floating-bubble"));
    expect(screen.getByTestId("chat-widget")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("chat-widget-close"));

    expect(screen.queryByTestId("chat-widget")).not.toBeInTheDocument();
    expect(screen.getByTestId("floating-bubble")).toBeInTheDocument();
  });

  it("passes the query-string config into ChatWidget (theme surfaces in the header)", async () => {
    setSearch("?theme=calm-blue");
    render(<EmbedClient />);
    await userEvent.click(screen.getByTestId("floating-bubble"));

    expect(screen.getByTestId("chat-widget-theme")).toHaveTextContent("calm-blue");
  });

  it("toggles open/closed multiple times without leaking either subtree", async () => {
    render(<EmbedClient />);

    for (let i = 0; i < 3; i++) {
      expect(screen.getByTestId("floating-bubble")).toBeInTheDocument();
      await act(async () => {
        await userEvent.click(screen.getByTestId("floating-bubble"));
      });
      expect(screen.getByTestId("chat-widget")).toBeInTheDocument();
      await act(async () => {
        await userEvent.click(screen.getByTestId("chat-widget-close"));
      });
      expect(screen.queryByTestId("chat-widget")).not.toBeInTheDocument();
    }
  });
});
