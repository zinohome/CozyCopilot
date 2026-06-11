import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isNativeApp, getPlatform } from "./capacitor";

describe("capabilities/capacitor", () => {
  beforeEach(() => {
    // Each test installs its own Capacitor global
  });

  afterEach(() => {
    delete (window as { Capacitor?: unknown }).Capacitor;
  });

  it("isNativeApp is true", () => {
    expect(isNativeApp).toBe(true);
  });

  it("getPlatform returns 'ios' when window.Capacitor.getPlatform() returns 'ios'", () => {
    window.Capacitor = { getPlatform: () => "ios" };
    expect(getPlatform()).toBe("ios");
  });

  it("getPlatform returns 'android' when window.Capacitor.getPlatform() returns 'android'", () => {
    window.Capacitor = { getPlatform: () => "android" };
    expect(getPlatform()).toBe("android");
  });

  it("getPlatform returns 'ios' as fallback when window.Capacitor is absent", () => {
    expect(window.Capacitor).toBeUndefined();
    expect(getPlatform()).toBe("ios");
  });
});
