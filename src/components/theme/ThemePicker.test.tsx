import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useThemeStore } from "@/stores/theme";
import { ThemePicker } from "./ThemePicker";

describe("ThemePicker", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "cozy-orange", mode: "light" });
    localStorage.clear();
  });

  it("renders the trigger with the current theme label", () => {
    render(<ThemePicker />);
    const trigger = screen.getByTestId("theme-picker-trigger");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("Cozy Orange");
  });

  it("opens the popover on trigger click and lists all 5 presets", async () => {
    const user = userEvent.setup();
    render(<ThemePicker />);

    // Popover is closed initially.
    expect(screen.queryByTestId("theme-picker-popover")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("theme-picker-trigger"));

    const popover = await screen.findByTestId("theme-picker-popover");
    expect(popover).toBeInTheDocument();

    // All 5 presets are listed with their data-testids.
    expect(screen.getByTestId("theme-picker-cozy-orange")).toBeInTheDocument();
    expect(screen.getByTestId("theme-picker-calm-blue")).toBeInTheDocument();
    expect(screen.getByTestId("theme-picker-mint")).toBeInTheDocument();
    expect(screen.getByTestId("theme-picker-lavender")).toBeInTheDocument();
    expect(screen.getByTestId("theme-picker-mono")).toBeInTheDocument();
  });

  it("clicking a swatch calls setTheme and closes the popover", async () => {
    const user = userEvent.setup();
    const setThemeSpy = vi.spyOn(useThemeStore.getState(), "setTheme");
    render(<ThemePicker />);

    await user.click(screen.getByTestId("theme-picker-trigger"));
    await user.click(screen.getByTestId("theme-picker-mint"));

    expect(setThemeSpy).toHaveBeenCalledWith("mint");
    expect(useThemeStore.getState().theme).toBe("mint");
    expect(screen.queryByTestId("theme-picker-popover")).not.toBeInTheDocument();

    setThemeSpy.mockRestore();
  });

  it("the active preset has aria-current='true' and the others don't", async () => {
    const user = userEvent.setup();
    render(<ThemePicker />);

    await user.click(screen.getByTestId("theme-picker-trigger"));

    const active = screen.getByTestId("theme-picker-cozy-orange");
    const other = screen.getByTestId("theme-picker-calm-blue");

    expect(active).toHaveAttribute("aria-current", "true");
    expect(other).not.toHaveAttribute("aria-current", "true");
  });

  it("Escape closes the popover", async () => {
    const user = userEvent.setup();
    render(<ThemePicker />);

    await user.click(screen.getByTestId("theme-picker-trigger"));
    expect(screen.getByTestId("theme-picker-popover")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("theme-picker-popover")).not.toBeInTheDocument();
  });
});
