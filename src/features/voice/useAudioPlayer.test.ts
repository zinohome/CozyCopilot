import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAudioPlayer } from "./useAudioPlayer";

// `HTMLAudioElement` doesn't exist in jsdom, and even where it does the
// event dispatch surface is unreliable. The hook accepts an `AudioCtor`
// injection, so the test builds a fake class that mirrors the
// `addEventListener` / `removeEventListener` / `play` / `pause` API
// surface used by the hook, and we drive events through a captured
// `emit()` helper. This keeps the hook testable end-to-end without ever
// touching `globalThis`.
type FakeAudio = {
  src: string;
  volume: number;
  currentTime: number;
  duration: number;
  paused: boolean;
  error: { message: string } | null;
  pausedSpy: ReturnType<typeof vi.fn>;
  playSpy: ReturnType<typeof vi.fn>;
  listeners: Map<string, Set<(ev: Event) => void>>;
  emit: (event: string, ev?: Event) => void;
  play: () => Promise<void>;
  pause: () => void;
};

let lastAudio: FakeAudio | null = null;

function makeAudioCtor(opts?: { playImpl?: () => Promise<void> }): new () => HTMLAudioElement {
  const playImpl = opts?.playImpl;
  return class {
    src = "";
    volume = 1;
    currentTime = 0;
    duration = 0;
    paused = true;
    error: { message: string } | null = null;
    pausedSpy = vi.fn();
    playSpy = vi.fn();
    listeners = new Map<string, Set<(ev: Event) => void>>();
    // Declared on the class so TS sees it from `pause`/`play` (which use
    // the lexical `this`). The body is bound in the constructor.
    emit!: (event: string, ev?: Event) => void;

    addEventListener(event: string, cb: (ev: Event) => void) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event)!.add(cb);
    }
    removeEventListener(event: string, cb: (ev: Event) => void) {
      this.listeners.get(event)?.delete(cb);
    }

    play = () => {
      this.playSpy();
      this.paused = false;
      if (playImpl) return playImpl();
      return Promise.resolve();
    };

    pause = () => {
      this.pausedSpy();
      this.paused = true;
      this.emit("pause");
    };

    constructor() {
      this.emit = (event: string, ev?: Event) => {
        const cbs = this.listeners.get(event);
        if (!cbs) return;
        for (const cb of cbs) cb(ev ?? new Event(event));
      };
      lastAudio = this as unknown as FakeAudio;
    }
  } as unknown as new () => HTMLAudioElement;
}

beforeEach(() => {
  lastAudio = null;
});

describe("useAudioPlayer", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => useAudioPlayer({ AudioCtor: makeAudioCtor() }));
    expect(result.current.state).toEqual({ kind: "idle" });
  });

  it("play(url) sets audio.src and calls audio.play()", async () => {
    const Ctor = makeAudioCtor();
    const { result } = renderHook(() => useAudioPlayer({ AudioCtor: Ctor }));

    // Wait for the mount effect to construct the audio element.
    await act(async () => {
      await Promise.resolve();
    });
    expect(lastAudio).not.toBeNull();

    await act(async () => {
      await result.current.play("https://cdn.example.com/reply.mp3");
    });

    expect(lastAudio!.src).toBe("https://cdn.example.com/reply.mp3");
    expect(lastAudio!.playSpy).toHaveBeenCalled();
  });

  it("timeupdate event flips state to playing with currentTime", async () => {
    const Ctor = makeAudioCtor();
    const { result } = renderHook(() => useAudioPlayer({ AudioCtor: Ctor }));

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.play("https://cdn.example.com/reply.mp3");
    });

    await act(async () => {
      lastAudio!.currentTime = 1.5;
      lastAudio!.duration = 12;
      lastAudio!.emit("timeupdate");
    });

    expect(result.current.state).toEqual({
      kind: "playing",
      currentTime: 1.5,
      duration: 12,
    });
  });

  it("ended event flips state to ended", async () => {
    const Ctor = makeAudioCtor();
    const { result } = renderHook(() => useAudioPlayer({ AudioCtor: Ctor }));

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.play("https://cdn.example.com/reply.mp3");
    });

    await act(async () => {
      lastAudio!.emit("ended");
    });

    expect(result.current.state).toEqual({ kind: "ended" });
  });

  it("error event flips state to error with STREAM_INTERRUPTED", async () => {
    const Ctor = makeAudioCtor();
    const { result } = renderHook(() => useAudioPlayer({ AudioCtor: Ctor }));

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.play("https://cdn.example.com/reply.mp3");
    });

    await act(async () => {
      lastAudio!.error = { message: "MEDIA_ERR_NETWORK" };
      lastAudio!.emit("error");
    });

    expect(result.current.state).toEqual({
      kind: "error",
      code: "STREAM_INTERRUPTED",
      message: "MEDIA_ERR_NETWORK",
    });
  });

  it("pause() calls audio.pause() and flips state to paused", async () => {
    const Ctor = makeAudioCtor();
    const { result } = renderHook(() => useAudioPlayer({ AudioCtor: Ctor }));

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.play("https://cdn.example.com/reply.mp3");
    });

    // Simulate the `play` event firing so the hook considers us "playing".
    await act(async () => {
      lastAudio!.duration = 5;
      lastAudio!.emit("play");
    });
    expect(result.current.state.kind).toBe("playing");

    act(() => {
      result.current.pause();
    });

    expect(lastAudio!.pausedSpy).toHaveBeenCalled();
    expect(result.current.state).toEqual({
      kind: "paused",
      currentTime: 0,
      duration: 5,
    });
  });
});
