import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useThemeStore } from "@/stores/theme";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "cozy-orange", mode: "light" });
    localStorage.clear();
  });

  it("renders the toggle with aria-pressed reflecting the current mode (light=false)", () => {
    render(<ThemeToggle />);
    const btn = screen.getByTestId("theme-toggle");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveAttribute("aria-label");
  });

  it("aria-pressed flips to true when the store is in dark mode", () => {
    useThemeStore.setState({ mode: "dark" });
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking calls toggleMode", async () => {
    const user = userEvent.setup();
    const toggleSpy = vi.spyOn(useThemeStore.getState(), "toggleMode");
    render(<ThemeToggle />);

    await user.click(screen.getByTestId("theme-toggle"));
    expect(toggleSpy).toHaveBeenCalledTimes(1);
    expect(useThemeStore.getState().mode).toBe("dark");

    await user.click(screen.getByTestId("theme-toggle"));
    expect(useThemeStore.getState().mode).toBe("light");

    toggleSpy.mockRestore();
  });

  it("has an aria-label that mentions dark mode", () => {
    render(<ThemeToggle />);
    const btn = screen.getByTestId("theme-toggle");
    // Label text is locale-switchable but must mention "mode" so screen
    // reader users understand the toggle's purpose. We assert the
    // contract, not the exact wording.
    expect(btn.getAttribute("aria-label") ?? "").toMatch(/mode/i);
  });
});
