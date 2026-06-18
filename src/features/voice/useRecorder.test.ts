import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecorder } from "./useRecorder";

// `MediaRecorder` doesn't exist in jsdom and we don't want to pollute the
// global — the hook accepts `MediaRecorderCtor` as an injected factory.
// The fake mirrors the surface used by the hook: `new Ctor(stream, opts)`
// returns an instance with `start()`, `stop()`, an `EventTarget`-style
// listener API, and a `state` field. Tests drive `dataavailable`, `stop`,
// and `error` via the captured instance handle so we can assert end-to-end
// behavior without touching `globalThis`.
type FakeRecorder = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  state: "inactive" | "recording";
  stream: MediaStream;
  mimeType: string;
  emitData: (size: number) => void;
  emitStop: () => void;
  emitError: (message: string) => void;
};

let lastRecorder: FakeRecorder | null = null;
let constructorImpl: (stream: MediaStream, opts?: { mimeType?: string }) => void;

class FakeMediaRecorder {
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
  });
  state: "inactive" | "recording" = "inactive";
  stream: MediaStream;
  mimeType: string;

  // Mirror the real MediaRecorder (EventTarget) with both property-style
  // handlers (used by the hook's `start()`) and addEventListener
  // (used by the hook's `stop()` promise wiring).
  private dataListeners = new Set<(ev: { data: Blob }) => void>();
  private stopListeners = new Set<() => void>();
  private errorListeners = new Set<(ev: Event) => void>();

  ondataavailable: ((ev: { data: Blob }) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onstop: (() => void) | null = null;

  addEventListener(event: string, cb: unknown): void {
    if (event === "dataavailable") this.dataListeners.add(cb as (ev: { data: Blob }) => void);
    if (event === "stop") this.stopListeners.add(cb as () => void);
    if (event === "error") this.errorListeners.add(cb as (ev: Event) => void);
  }
  removeEventListener(event: string, cb: unknown): void {
    if (event === "dataavailable") this.dataListeners.delete(cb as (ev: { data: Blob }) => void);
    if (event === "stop") this.stopListeners.delete(cb as () => void);
    if (event === "error") this.errorListeners.delete(cb as (ev: Event) => void);
  }

  // Public so tests can drive event delivery. Using public arrow-bound
  // class fields means we don't need to alias `this` in the constructor
  // (which the ESLint `no-this-alias` rule rejects).
  emitData = (size: number): void => {
    const ev = { data: new Blob([new Uint8Array(size)], { type: this.mimeType }) };
    this.ondataavailable?.(ev);
    for (const cb of this.dataListeners) cb(ev);
  };
  emitStop = (): void => {
    // Real browsers deliver a final dataavailable before `stop`.
    this.emitData(0);
    this.onstop?.();
    for (const cb of this.stopListeners) cb();
  };
  emitError = (message: string): void => {
    const ev = { error: { message } } as unknown as Event;
    this.onerror?.(ev);
    for (const cb of this.errorListeners) cb(ev);
  };

  constructor(stream: MediaStream, opts?: { mimeType?: string }) {
    this.stream = stream;
    this.mimeType = opts?.mimeType ?? "";
    // Bind to the requested constructor impl so test cases can override
    // behavior (e.g. to throw on construction). Throwing here mirrors the
    // way browsers reject unsupported MIME types at construction time.
    constructorImpl?.(stream, { mimeType: this.mimeType });
    // Re-export the same instance under a narrowed handle type so tests
    // don't depend on the full class surface. `this` isn't aliased — the
    // arrow-bound fields above close over the instance implicitly.
    lastRecorder = {
      start: this.start,
      stop: this.stop,
      state: this.state,
      stream: this.stream,
      mimeType: this.mimeType,
      emitData: this.emitData,
      emitStop: this.emitStop,
      emitError: this.emitError,
    };
  }
}

function makeRecorderCtor(): typeof MediaRecorder {
  return FakeMediaRecorder as unknown as typeof MediaRecorder;
}

beforeEach(() => {
  lastRecorder = null;
  constructorImpl = () => {
    // default impl is a no-op; tests override for failure scenarios.
  };
});

describe("useRecorder", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() =>
      useRecorder({
        getMedia: vi.fn(),
        MediaRecorderCtor: makeRecorderCtor(),
      }),
    );
    expect(result.current.state).toEqual({ kind: "idle" });
  });

  it("start() flips to recording and calls getMedia with {audio:true}", async () => {
    const fakeStream = {
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;
    const getMedia = vi.fn(async () => fakeStream);
    const Ctor = makeRecorderCtor();

    const { result } = renderHook(() => useRecorder({ getMedia, MediaRecorderCtor: Ctor }));

    await act(async () => {
      await result.current.start();
    });

    expect(getMedia).toHaveBeenCalledWith({ audio: true });
    expect(lastRecorder).not.toBeNull();
    expect(lastRecorder!.start).toHaveBeenCalled();
    expect(result.current.state.kind).toBe("recording");
    if (result.current.state.kind === "recording") {
      expect(typeof result.current.state.startedAt).toBe("number");
    }
  });

  it("stop() returns a Blob with the configured mime type", async () => {
    const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    const getMedia = vi.fn(async () => fakeStream);
    const Ctor = makeRecorderCtor();
    const mimeType = "audio/webm;codecs=opus";

    const { result } = renderHook(() =>
      useRecorder({ getMedia, MediaRecorderCtor: Ctor, mimeType }),
    );

    await act(async () => {
      await result.current.start();
    });

    // Simulate the browser delivering chunks while recording is active.
    act(() => {
      lastRecorder!.emitData(8);
      lastRecorder!.emitData(16);
    });

    let blob: Blob | null = null;
    await act(async () => {
      const stopPromise = result.current.stop();
      // emitStop fires the final dataavailable (size 0) and the stop event,
      // matching the real MediaRecorder delivery order.
      lastRecorder!.emitStop();
      blob = await stopPromise;
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob!.type).toBe(mimeType);
    // Tracks released on stop.
    expect(result.current.state).toEqual({ kind: "idle" });
  });

  it("cancel() discards chunks and returns to idle without producing a blob", async () => {
    const stopTrack = vi.fn();
    const fakeStream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const getMedia = vi.fn(async () => fakeStream);
    const Ctor = makeRecorderCtor();

    const { result } = renderHook(() => useRecorder({ getMedia, MediaRecorderCtor: Ctor }));

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      lastRecorder!.emitData(64);
    });

    act(() => {
      result.current.cancel();
    });

    expect(lastRecorder!.stop).toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: "idle" });
    // Stream tracks were stopped — the mic indicator turns off.
    expect(stopTrack).toHaveBeenCalled();
  });

  it("getMedia rejection (permission denied) flips state to error with MIC_DENIED", async () => {
    const getMedia = vi.fn(async () => {
      // The browser surfaces a DOMException for permission denials; the
      // hook normalizes any non-ApiError throw into MIC_DENIED.
      throw new Error("Permission denied");
    });
    const Ctor = makeRecorderCtor();

    const { result } = renderHook(() => useRecorder({ getMedia, MediaRecorderCtor: Ctor }));

    let caught: Error | null = null;
    await act(async () => {
      try {
        await result.current.start();
      } catch (e) {
        caught = e as Error;
      }
    });

    expect(caught).not.toBeNull();
    expect((caught as unknown as { code: string }).code).toBe("MIC_DENIED");
    expect(result.current.state).toEqual({
      kind: "error",
      code: "MIC_DENIED",
      message: "Permission denied",
    });
  });

  it("MediaRecorder constructor throw (unsupported codec) flips state to error with MIC_UNSUPPORTED", async () => {
    const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    const getMedia = vi.fn(async () => fakeStream);
    // Override the constructor impl so `new Ctor(...)` throws, mirroring
    // the way browsers reject unsupported MIME types at construction time.
    constructorImpl = () => {
      throw new Error("mimeType not supported");
    };
    const Ctor = makeRecorderCtor();

    const { result } = renderHook(() => useRecorder({ getMedia, MediaRecorderCtor: Ctor }));

    let caught: Error | null = null;
    await act(async () => {
      try {
        await result.current.start();
      } catch (e) {
        caught = e as Error;
      }
    });

    expect(caught).not.toBeNull();
    expect((caught as unknown as { code: string }).code).toBe("MIC_UNSUPPORTED");
    expect(result.current.state).toEqual({
      kind: "error",
      code: "MIC_UNSUPPORTED",
      message: "mimeType not supported",
    });
  });
});
