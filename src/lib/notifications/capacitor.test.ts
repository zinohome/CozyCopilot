import { describe, it, expect, vi, afterEach } from "vitest";
import { getPermission, requestPermission, notify } from "./capacitor";

/**
 * M3.9 wires up the real `@capacitor/local-notifications` plugin. The
 * plugin registers itself with the global Capacitor registry on first
 * import, so we mock it to keep these tests deterministic: the
 * dispatcher in index.ts decides which impl to call, but the impl
 * itself does not need to talk to a real native bridge here.
 */
vi.mock("@capacitor/core", () => ({}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    requestPermissions: vi.fn(async () => ({ display: "default" })),
    schedule: vi.fn(async () => ({ notifications: [] })),
  },
}));

describe("notifications/capacitor", () => {
  afterEach(() => {
    delete (window as { Capacitor?: unknown }).Capacitor;
    vi.clearAllMocks();
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

  it("notify schedules a LocalNotifications.schedule call when the runtime is present", async () => {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    (window as { Capacitor?: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => "ios",
    };
    notify({ title: "Hello", body: "World", id: 42 });
    // Fire-and-forget: microtask drain
    await Promise.resolve();
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
    const call = (LocalNotifications.schedule as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as { notifications: Array<{ id: number; title: string; body: string }> };
    expect(call.notifications[0]).toMatchObject({ id: 42, title: "Hello", body: "World" });
  });

  it("notify auto-assigns an id when none is provided", async () => {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    (window as { Capacitor?: { getPlatform: () => string } }).Capacitor = {
      getPlatform: () => "android",
    };
    notify({ title: "Auto-id" });
    await Promise.resolve();
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
  });
});
