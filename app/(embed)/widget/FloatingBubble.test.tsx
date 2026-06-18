import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloatingBubble } from "./FloatingBubble";

describe("FloatingBubble", () => {
  it("renders the bubble button with the default aria-label", () => {
    render(<FloatingBubble onClick={vi.fn()} />);
    expect(screen.getByTestId("floating-bubble")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "open-chat" })).toBeInTheDocument();
  });

  it("renders a custom child (e.g. brand mark) inside the button", () => {
    render(
      <FloatingBubble onClick={vi.fn()}>
        <svg data-testid="brand-mark" />
      </FloatingBubble>,
    );
    expect(screen.getByTestId("brand-mark")).toBeInTheDocument();
  });

  it("calls onClick when the bubble is clicked", async () => {
    const onClick = vi.fn();
    render(<FloatingBubble onClick={onClick} />);

    await userEvent.click(screen.getByTestId("floating-bubble"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("honors a custom aria-label", () => {
    render(<FloatingBubble onClick={vi.fn()} ariaLabel="open-help" />);
    expect(screen.getByRole("button", { name: "open-help" })).toBeInTheDocument();
  });
});
