import { describe, it, expect, beforeEach } from "vitest";
import { useThemeStore } from "./theme";

describe("useThemeStore", () => {
  beforeEach(() => {
    // Each test starts from a clean store + localStorage so we can
    // assert the persist envelope (`{"state":{"theme":...,"mode":...}}`).
    useThemeStore.setState({ theme: "cozy-orange", mode: "light" });
    localStorage.clear();
  });

  it("has the spec defaults: cozy-orange / light", () => {
    const state = useThemeStore.getState();
    expect(state.theme).toBe("cozy-orange");
    expect(state.mode).toBe("light");
  });

  it("setTheme('calm-blue') updates the store and localStorage", () => {
    useThemeStore.getState().setTheme("calm-blue");
    expect(useThemeStore.getState().theme).toBe("calm-blue");

    // zustand/persist's createJSONStorage writes the full envelope, not
    // just the field. We assert the key + the stored slice to catch a
    // regression where someone accidentally drops the persist middleware.
    const raw = localStorage.getItem("cozy-theme");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as { state?: { theme?: string } };
    expect(parsed.state?.theme).toBe("calm-blue");
  });

  it("setMode('dark') updates the store and localStorage", () => {
    useThemeStore.getState().setMode("dark");
    expect(useThemeStore.getState().mode).toBe("dark");

    const raw = localStorage.getItem("cozy-theme");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as { state?: { mode?: string } };
    expect(parsed.state?.mode).toBe("dark");
  });

  it("toggleMode flips light → dark → light", () => {
    expect(useThemeStore.getState().mode).toBe("light");
    useThemeStore.getState().toggleMode();
    expect(useThemeStore.getState().mode).toBe("dark");
    useThemeStore.getState().toggleMode();
    expect(useThemeStore.getState().mode).toBe("light");
  });

  it("rehydrates from localStorage on store creation (not the default)", () => {
    // Simulate a stored payload from a prior session.
    localStorage.setItem(
      "cozy-theme",
      JSON.stringify({ state: { theme: "lavender", mode: "dark" }, version: 0 }),
    );

    // Force the persist middleware to re-read. Setting state directly
    // bypasses persist; we instead rehydrate via `useThemeStore.persist.rehydrate()`.
    void useThemeStore.persist.rehydrate();

    const state = useThemeStore.getState();
    expect(state.theme).toBe("lavender");
    expect(state.mode).toBe("dark");
  });

  it("ignores an unknown theme name on rehydrate", () => {
    // Defensive: a stale localStorage payload from a removed theme must
    // not crash the store. The rehydrate hook falls back to defaults.
    localStorage.setItem(
      "cozy-theme",
      JSON.stringify({ state: { theme: "neon-pink", mode: "light" }, version: 0 }),
    );
    void useThemeStore.persist.rehydrate();

    expect(useThemeStore.getState().theme).toBe("cozy-orange");
    expect(useThemeStore.getState().mode).toBe("light");
  });

  it("ignores an unknown mode value on rehydrate", () => {
    localStorage.setItem(
      "cozy-theme",
      JSON.stringify({ state: { theme: "mint", mode: "neon" }, version: 0 }),
    );
    void useThemeStore.persist.rehydrate();

    expect(useThemeStore.getState().theme).toBe("mint");
    expect(useThemeStore.getState().mode).toBe("light");
  });
});
