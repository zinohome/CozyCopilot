import { describe, it, expect } from "vitest";
import { applyThemeToDom } from "./applyThemeToDom";

describe("applyThemeToDom", () => {
  it("sets data-theme and data-mode on documentElement", () => {
    const cleanup = applyThemeToDom("calm-blue", "dark");
    const root = document.documentElement;
    expect(root.getAttribute("data-theme")).toBe("calm-blue");
    expect(root.getAttribute("data-mode")).toBe("dark");
    cleanup();
  });

  it("the cleanup function removes both attributes", () => {
    applyThemeToDom("mint", "light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("mint");
    expect(document.documentElement.getAttribute("data-mode")).toBe("light");

    // Re-apply to get a fresh cleanup; verify it strips everything.
    const cleanup = applyThemeToDom("lavender", "light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("lavender");

    cleanup();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.documentElement.hasAttribute("data-mode")).toBe(false);
  });

  it("a second applyThemeToDom overwrites the first without removing in between", () => {
    applyThemeToDom("cozy-orange", "light");
    const cleanup = applyThemeToDom("mono", "dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("mono");
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    cleanup();
  });

  it("is SSR-safe: returns a no-op cleanup when document is undefined", () => {
    const g = globalThis as { document?: unknown };
    const originalDocument = g.document;
    try {
      // Wipe document so the implementation's `typeof document ===
      // "undefined"` branch fires. The cast keeps the JS delete valid
      // under `strict` without `noImplicitAny` complaining.
      g.document = undefined;

      const cleanup = applyThemeToDom("cozy-orange", "light");
      // Cleanup is a no-op; calling it shouldn't throw.
      expect(() => cleanup()).not.toThrow();
    } finally {
      g.document = originalDocument;
    }
  });
});
