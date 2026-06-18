import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionsClient } from "./SessionsClient";

vi.mock("./SessionList", () => ({
  SessionList: (props: { activeId: string | null; onSelect: (id: string) => void }) => (
    <button type="button" data-testid="list-stub" onClick={() => props.onSelect("s-99")}>
      active:{props.activeId ?? "none"}
    </button>
  ),
}));

describe("SessionsClient", () => {
  it("forwards activeId and onSelect to SessionList", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SessionsClient activeId="s-1" onSelect={onSelect} />);
    expect(screen.getByTestId("list-stub")).toHaveTextContent("active:s-1");
    await user.click(screen.getByTestId("list-stub"));
    expect(onSelect).toHaveBeenCalledWith("s-99");
  });

  it("renders the empty activeId case", () => {
    render(<SessionsClient activeId={null} onSelect={() => {}} />);
    expect(screen.getByTestId("list-stub")).toHaveTextContent("active:none");
  });
});