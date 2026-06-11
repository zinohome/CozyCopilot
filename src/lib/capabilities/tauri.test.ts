import { describe, it, expect } from "vitest";
import { isNativeApp, getPlatform } from "./tauri";

describe("capabilities/tauri", () => {
  it("isNativeApp is true", () => {
    expect(isNativeApp).toBe(true);
  });

  it("getPlatform returns a tauri-* identifier derived from navigator.platform", () => {
    const platforms = new Set(["tauri-mac", "tauri-win", "tauri-linux"]);
    expect(platforms.has(getPlatform())).toBe(true);
  });
});
