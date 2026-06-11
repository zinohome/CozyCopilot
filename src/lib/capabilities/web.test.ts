import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkMicrophonePermission,
  requestMicrophonePermission,
  isNativeApp,
  getPlatform,
} from "./web";

// jsdom does not expose navigator.permissions or navigator.mediaDevices.
// We install stubs in beforeEach so vi.spyOn has a real object to attach to,
// then restore the original descriptors after each test.
function ensureNavigatorStub(
  key: "permissions" | "mediaDevices",
  build: () => Record<string, unknown>,
) {
  const original = Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    key,
  );
  Object.defineProperty(Navigator.prototype, key, {
    configurable: true,
    get: () => build(),
  });
  return () => {
    if (original) {
      Object.defineProperty(Navigator.prototype, key, original);
    } else {
      delete (Navigator.prototype as unknown as Record<string, unknown>)[key];
    }
  };
}

describe("capabilities/web", () => {
  let restorePermissions: () => void;
  let restoreMediaDevices: () => void;
  let permissionsQuery: ReturnType<typeof vi.fn>;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    permissionsQuery = vi.fn();
    getUserMedia = vi.fn();
    restorePermissions = ensureNavigatorStub("permissions", () => ({
      query: permissionsQuery,
    }));
    restoreMediaDevices = ensureNavigatorStub("mediaDevices", () => ({
      getUserMedia,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restorePermissions();
    restoreMediaDevices();
  });

  describe("checkMicrophonePermission", () => {
    it("returns 'granted' when navigator.permissions.query resolves to granted", async () => {
      permissionsQuery.mockResolvedValue({ state: "granted" });
      await expect(checkMicrophonePermission()).resolves.toBe("granted");
      expect(permissionsQuery).toHaveBeenCalledWith({
        name: "microphone",
      });
    });

    it("returns 'denied' when navigator.permissions.query resolves to denied", async () => {
      permissionsQuery.mockResolvedValue({ state: "denied" });
      await expect(checkMicrophonePermission()).resolves.toBe("denied");
    });

    it("returns 'prompt' when navigator.permissions is unavailable", async () => {
      restorePermissions();
      await expect(checkMicrophonePermission()).resolves.toBe("prompt");
    });

    it("returns 'prompt' when permissions.query throws (e.g. Safari)", async () => {
      permissionsQuery.mockRejectedValue(new Error("not supported"));
      await expect(checkMicrophonePermission()).resolves.toBe("prompt");
    });
  });

  describe("requestMicrophonePermission", () => {
    it("returns true when getUserMedia resolves and stops tracks", async () => {
      const stop = vi.fn();
      getUserMedia.mockResolvedValue({
        getTracks: () => [{ stop }],
      });
      await expect(requestMicrophonePermission()).resolves.toBe(true);
      expect(stop).toHaveBeenCalled();
    });

    it("returns false when getUserMedia rejects", async () => {
      getUserMedia.mockRejectedValue(new Error("denied"));
      await expect(requestMicrophonePermission()).resolves.toBe(false);
    });

    it("returns false when navigator.mediaDevices is unavailable", async () => {
      restoreMediaDevices();
      await expect(requestMicrophonePermission()).resolves.toBe(false);
    });
  });

  describe("getPlatform", () => {
    it("returns 'embed' when window.self !== window.top", () => {
      // jsdom gives us the same window for self/top; force a different value
      const originalDescriptor = Object.getOwnPropertyDescriptor(window, "top");
      Object.defineProperty(window, "top", {
        configurable: true,
        get: () => ({} as Window),
      });
      try {
        expect(getPlatform()).toBe("embed");
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(window, "top", originalDescriptor);
        } else {
          // @ts-expect-error — restore
          delete window.top;
        }
      }
    });

    it("returns 'web' when self === top", () => {
      expect(getPlatform()).toBe("web");
    });
  });

  describe("isNativeApp", () => {
    it("is false on web", () => {
      expect(isNativeApp).toBe(false);
    });
  });
});
