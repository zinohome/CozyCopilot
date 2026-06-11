import { describe, it, expect, afterEach } from "vitest";
import { getPermission, requestPermission, notify } from "./capacitor";

describe("notifications/capacitor", () => {
  afterEach(() => {
    delete (window as { Capacitor?: unknown }).Capacitor;
  });

  it("getPermission returns 'unsupported' when window.Capacitor is absent", () => {
    expect(getPermission()).toBe("unsupported");
  });

  it("getPermission returns 'default' when window.Capacitor is present", () => {
    (window as { Capacitor?: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => "ios",
    };
    expect(getPermission()).toBe("default");
  });

  it("requestPermission returns 'unsupported' when window.Capacitor is absent", async () => {
    await expect(requestPermission()).resolves.toBe("unsupported");
  });

  it("requestPermission returns 'default' when window.Capacitor is present", async () => {
    (window as { Capacitor?: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => "android",
    };
    await expect(requestPermission()).resolves.toBe("default");
  });

  it("notify is a no-op when window.Capacitor is absent", () => {
    // Should not throw
    notify({ title: "Hello" });
  });

  it("notify is a no-op when window.Capacitor is present (M3.9 stub)", () => {
    (window as { Capacitor?: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => "ios",
    };
    // M3.9 will replace with real LocalNotifications.schedule; for M3.3 the body is empty
    notify({ title: "Hello", body: "World", id: 1 });
  });
});
