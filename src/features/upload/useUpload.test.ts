import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useUpload } from "./useUpload";
import { useAuthStore } from "@/stores/auth";

// We replace the global XMLHttpRequest with a controllable fake. jsdom's XHR
// is a partial polyfill that can't reliably dispatch progress events, so
// every test installs its own class and the hook reads `globalThis.XMLHttpRequest`
// at the time `new XMLHttpRequest()` is called.
type FakeXhrHandlers = {
  uploadProgress?: (e: { loaded: number; total: number; lengthComputable: boolean }) => void;
  load?: () => void;
  error?: () => void;
};

type FakeXhrInstance = {
  upload: { addEventListener: (event: string, cb: (e: unknown) => void) => void };
  addEventListener: (event: string, cb: (e: unknown) => void) => void;
  open: Mock;
  setRequestHeader: Mock;
  send: Mock;
  status: number;
  responseText: string;
  triggerUploadProgress: (loaded: number, total: number) => void;
  triggerLoad: () => void;
  triggerError: () => void;
};

let lastInstance: FakeXhrInstance | null = null;
let fakeXhrStatus = 200;
let fakeXhrBody: unknown = null;
let fakeXhrResponseTextOverride: string | null = null;

function makeFakeXhrClass(): { new (): FakeXhrInstance } {
  return class {
    upload = {
      addEventListener: (_event: string, cb: (e: unknown) => void) => {
        handlers.uploadProgress = cb as unknown as FakeXhrHandlers["uploadProgress"];
      },
    };
    addEventListener = (event: string, cb: (e: unknown) => void) => {
      if (event === "load") handlers.load = cb as unknown as FakeXhrHandlers["load"];
      if (event === "error") handlers.error = cb as unknown as FakeXhrHandlers["error"];
    };
    open = vi.fn();
    setRequestHeader = vi.fn();
    send = vi.fn();
    status = 0;
    responseText = "";

    constructor() {
      const instance: FakeXhrInstance = this as unknown as FakeXhrInstance;
      instance.status = fakeXhrStatus;
      instance.responseText =
        fakeXhrResponseTextOverride ?? JSON.stringify({ ok: true, data: fakeXhrBody });
      instance.triggerUploadProgress = (loaded, total) => {
        handlers.uploadProgress?.({ loaded, total, lengthComputable: true });
      };
      instance.triggerLoad = () => handlers.load?.();
      instance.triggerError = () => handlers.error?.();
      lastInstance = instance;
    }
  } as unknown as { new (): FakeXhrInstance };
}

const handlers: FakeXhrHandlers = {};
// Captured at module load — jsdom's XHR is set up before any test runs.
const originalXHR = globalThis.XMLHttpRequest;

describe("useUpload", () => {
  beforeEach(() => {
    handlers.uploadProgress = undefined;
    handlers.load = undefined;
    handlers.error = undefined;
    lastInstance = null;
    fakeXhrStatus = 200;
    fakeXhrBody = { url: "https://cdn.example.com/a.png", filename: "a.png", size: 8, mime: "image/png" };
    fakeXhrResponseTextOverride = null;
    // jsdom's global XMLHttpRequest is a non-writable getter, so we use
    // defineProperty to swap it out for the test fake.
    Object.defineProperty(globalThis, "XMLHttpRequest", {
      configurable: true,
      writable: true,
      value: makeFakeXhrClass(),
    });
    useAuthStore.setState({ jwt: "test-jwt", userId: "u-1", email: "u@x", role: "user" });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "XMLHttpRequest", {
      configurable: true,
      writable: true,
      value: originalXHR,
    });
    useAuthStore.setState({ jwt: "", userId: "", email: "", role: "" });
    vi.restoreAllMocks();
  });

  it("returns the parsed body on 2xx response", async () => {
    const { result } = renderHook(() => useUpload());
    const file = new File([new Uint8Array(8).fill(1)], "a.png", { type: "image/png" });

    let uploaded: { url: string } | null = null;
    act(() => {
      result.current.upload(file, { sessionId: "s1", personalityId: "p1" }).then((r) => {
        uploaded = r;
      });
    });
    // At this point the XHR has been created but `load` hasn't fired yet.
    await waitFor(() => expect(lastInstance).not.toBeNull());
    await act(async () => {
      lastInstance!.triggerLoad();
      await Promise.resolve();
    });

    expect(uploaded).toEqual({
      url: "https://cdn.example.com/a.png",
      filename: "a.png",
      size: 8,
      mime: "image/png",
    });
    expect(lastInstance!.open).toHaveBeenCalledWith("POST", "/api/cozy/upload");
    expect(lastInstance!.setRequestHeader).toHaveBeenCalledWith("Authorization", "Bearer test-jwt");
  });

  it("rejects with ApiError on 4xx/5xx response", async () => {
    fakeXhrStatus = 413;
    fakeXhrResponseTextOverride = JSON.stringify({
      ok: false,
      error: { code: "FILE_TOO_LARGE", message: "文件超过 20MB 上限", retryable: false },
    });
    const { result } = renderHook(() => useUpload());
    const file = new File([new Uint8Array(8).fill(1)], "big.bin");

    let captured: { code: string; message: string; retryable: boolean } | null = null;
    act(() => {
      result.current
        .upload(file, { sessionId: "s1", personalityId: "p1" })
        .catch((e: { code: string; message: string; retryable: boolean }) => {
          captured = e;
        });
    });
    await waitFor(() => expect(lastInstance).not.toBeNull());
    await act(async () => {
      lastInstance!.triggerLoad();
      await Promise.resolve();
    });

    expect(captured).not.toBeNull();
    expect(captured!.code).toBe("FILE_TOO_LARGE");
    expect(captured!.message).toBe("文件超过 20MB 上限");
    expect(captured!.retryable).toBe(false);
    // The hook also stores the error in state for UI rendering.
    expect(result.current.error?.code).toBe("FILE_TOO_LARGE");
  });

  it("calls onProgress callback with the percent value", async () => {
    const { result } = renderHook(() => useUpload());
    const onProgress = vi.fn();
    const file = new File([new Uint8Array(8).fill(1)], "a.png");

    act(() => {
      result.current.upload(file, { sessionId: "s1", personalityId: "p1", onProgress });
    });
    await waitFor(() => expect(lastInstance).not.toBeNull());

    await act(async () => {
      lastInstance!.triggerUploadProgress(50, 100);
      await Promise.resolve();
    });
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(result.current.progress).toBe(50);

    await act(async () => {
      lastInstance!.triggerUploadProgress(100, 100);
      await Promise.resolve();
    });
    expect(onProgress).toHaveBeenCalledWith(100);
    expect(result.current.progress).toBe(100);
  });

  it("sets uploading: true during the upload, false after", async () => {
    const { result } = renderHook(() => useUpload());
    const file = new File([new Uint8Array(8).fill(1)], "a.png");

    expect(result.current.uploading).toBe(false);

    act(() => {
      result.current.upload(file, { sessionId: "s1", personalityId: "p1" });
    });
    await waitFor(() => expect(lastInstance).not.toBeNull());
    // While in flight.
    expect(result.current.uploading).toBe(true);

    await act(async () => {
      lastInstance!.triggerLoad();
      await Promise.resolve();
    });
    // After completion.
    expect(result.current.uploading).toBe(false);
  });
});
