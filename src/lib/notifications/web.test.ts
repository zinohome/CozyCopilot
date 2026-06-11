import { describe, it, expect, vi, afterEach } from "vitest";
import { getPermission, requestPermission, notify } from "./web";

type NotificationCtor = new (
  title: string,
  options?: { body?: string; icon?: string; tag?: string },
) => unknown;

interface NotificationGlobal {
  permission: "granted" | "denied" | "default";
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

/**
 * jsdom does not expose window.Notification. We install a fresh stub
 * per test via vi.stubGlobal, then restore in afterEach.
 */
function installNotification(overrides: Partial<NotificationGlobal>) {
  const Notification = vi.fn() as unknown as NotificationCtor &
    NotificationGlobal;
  Object.assign(Notification, {
    permission: "default" as const,
    requestPermission: vi.fn().mockResolvedValue("granted"),
    ...overrides,
  });
  vi.stubGlobal("Notification", Notification);
  return Notification;
}

describe("notifications/web", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("getPermission", () => {
    it("returns 'granted' when Notification.permission === 'granted'", () => {
      installNotification({ permission: "granted" });
      expect(getPermission()).toBe("granted");
    });

    it("returns 'denied' when Notification.permission === 'denied'", () => {
      installNotification({ permission: "denied" });
      expect(getPermission()).toBe("denied");
    });

    it("returns 'default' when Notification.permission === 'default'", () => {
      installNotification({ permission: "default" });
      expect(getPermission()).toBe("default");
    });

    it("returns 'unsupported' when the Notification global is missing", () => {
      // vi.stubGlobal("Notification", undefined) would still leave the
      // property on window ("Notification" in window === true), so we
      // remove it entirely to match the real-world absence condition
      // that the production `in` check looks for.
      delete (window as { Notification?: unknown }).Notification;
      expect(getPermission()).toBe("unsupported");
    });
  });

  describe("requestPermission", () => {
    it("calls Notification.requestPermission and returns the result", async () => {
      const requestPermissionMock = vi.fn().mockResolvedValue("granted");
      installNotification({
        permission: "default",
        requestPermission: requestPermissionMock,
      });
      await expect(requestPermission()).resolves.toBe("granted");
      expect(requestPermissionMock).toHaveBeenCalledOnce();
    });

    it("short-circuits to 'granted' when permission is already granted", async () => {
      const requestPermissionMock = vi.fn().mockResolvedValue("denied");
      installNotification({
        permission: "granted",
        requestPermission: requestPermissionMock,
      });
      await expect(requestPermission()).resolves.toBe("granted");
      expect(requestPermissionMock).not.toHaveBeenCalled();
    });

    it("short-circuits to 'denied' when permission is already denied", async () => {
      const requestPermissionMock = vi.fn().mockResolvedValue("granted");
      installNotification({
        permission: "denied",
        requestPermission: requestPermissionMock,
      });
      await expect(requestPermission()).resolves.toBe("denied");
      expect(requestPermissionMock).not.toHaveBeenCalled();
    });

    it("returns 'unsupported' when the Notification global is missing", async () => {
      delete (window as { Notification?: unknown }).Notification;
      await expect(requestPermission()).resolves.toBe("unsupported");
    });
  });

  describe("notify", () => {
    it("constructs a new Notification(title, {body, icon, tag}) when permission is granted", () => {
      const Notification = installNotification({ permission: "granted" });
      notify({
        title: "Hello",
        body: "World",
        icon: "/icon.png",
        tag: "greeting",
      });
      expect(Notification).toHaveBeenCalledOnce();
      expect(Notification).toHaveBeenCalledWith("Hello", {
        body: "World",
        icon: "/icon.png",
        tag: "greeting",
      });
    });

    it("is a no-op when permission is not 'granted'", () => {
      const Notification = installNotification({ permission: "default" });
      notify({ title: "Hello" });
      expect(Notification).not.toHaveBeenCalled();
    });

    it("is a no-op when the Notification global is missing", () => {
      delete (window as { Notification?: unknown }).Notification;
      // Should not throw
      notify({ title: "Hello" });
    });
  });
});
