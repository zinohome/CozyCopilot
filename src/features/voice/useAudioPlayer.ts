"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type ErrorCode } from "@/lib/api/errors";

export type PlayerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "playing"; currentTime: number; duration: number }
  | { kind: "paused"; currentTime: number; duration: number }
  | { kind: "ended" }
  | { kind: "error"; code: ErrorCode; message: string };

export interface UseAudioPlayerOptions {
  /**
   * Override the `HTMLAudioElement` constructor (testing / SSR). The hook
   * never touches `new Audio()` at module scope, so SSR is safe even
   * without injection; tests use this to drive events deterministically.
   */
  AudioCtor?: new () => HTMLAudioElement;
  /** Initial volume in [0, 1]. Default `1`. */
  initialVolume?: number;
}

export interface UseAudioPlayer {
  state: PlayerState;
  /** Start playback from `url`. Returns the underlying `audio.play()` promise. */
  play(url: string): Promise<void>;
  pause(): void;
  stop(): void;
  /** Set volume in [0, 1]. Values outside the range are clamped. */
  setVolume(v: number): void;
}

/**
 * React hook that wraps an `HTMLAudioElement` for TTS reply playback. The
 * voice BFF returns a `reply_audio_url` after a chat turn (spec §6.4:
 * "可选自动播放 audio (reply_audio_url)"); this hook provides the player
 * surface that the chat UI binds to.
 *
 * State machine:
 *   idle → loading → playing → paused → playing …
 *                          → ended
 *                          → error (STREAM_INTERRUPTED on load failure)
 *
 * Errors:
 *   - `audio.play()` rejected with `NotAllowedError` (autoplay blocked) is
 *     re-thrown to the caller — the typical fix is a "click to play"
 *     affordance, not a retry.
 *   - The `error` media event flips state to `{kind: "error", code:
 *     "STREAM_INTERRUPTED", ...}` so the chat UI can show the same banner
 *     it shows for SSE stream failures.
 *
 * Listeners are attached inside `useEffect` and removed on unmount. The
 * `AudioCtor` is only read once on mount so tests can swap in a fake
 * without race conditions.
 */
export function useAudioPlayer(options: UseAudioPlayerOptions = {}): UseAudioPlayer {
  const { AudioCtor, initialVolume = 1 } = options;

  const [state, setState] = useState<PlayerState>({ kind: "idle" });
  // Refs hold the live element and listener-cleanup callbacks so a re-render
  // (e.g. triggered by setState inside a listener) does not detach them.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // `cancelledRef` guards against the user calling `stop()`/`pause()` while
  // a play() promise is still settling — we don't want to flip state to
  // "playing" after the caller already asked us to stop.
  const cancelledRef = useRef(false);

  useEffect(() => {
    const Ctor: typeof HTMLAudioElement | undefined =
      AudioCtor ??
      (typeof HTMLAudioElement !== "undefined" ? HTMLAudioElement : undefined);
    if (!Ctor) return;

    const audio = new Ctor();
    audio.volume = clamp01(initialVolume);
    audioRef.current = audio;

    const onLoadStart = () => {
      setState({ kind: "loading" });
    };
    const onLoadedMetadata = () => {
      // We only know duration after metadata is parsed. Don't clobber a
      // "playing" state — that means metadata arrived mid-playback, which
      // is fine, just continue.
      setState((prev) => {
        if (prev.kind === "playing" || prev.kind === "paused") {
          return { ...prev, duration: audio.duration };
        }
        return prev;
      });
    };
    const onPlay = () => {
      cancelledRef.current = false;
      setState({
        kind: "playing",
        currentTime: audio.currentTime,
        duration: audio.duration,
      });
    };
    const onPause = () => {
      // Pause can also fire when audio reaches the end (some browsers);
      // the `ended` event will follow and is handled separately.
      setState((prev) => {
        if (prev.kind === "playing") {
          return {
            kind: "paused",
            currentTime: audio.currentTime,
            duration: audio.duration,
          };
        }
        return prev;
      });
    };
    const onTimeUpdate = () => {
      setState((prev) => {
        if (prev.kind === "loading" || prev.kind === "playing") {
          return {
            kind: "playing",
            currentTime: audio.currentTime,
            duration: audio.duration,
          };
        }
        return prev;
      });
    };
    const onEnded = () => {
      setState({ kind: "ended" });
    };
    const onError = () => {
      setState({
        kind: "error",
        code: "STREAM_INTERRUPTED",
        message: audio.error?.message ?? "Audio playback failed",
      });
    };

    audio.addEventListener("loadstart", onLoadStart);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("loadstart", onLoadStart);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      try {
        audio.pause();
      } catch {
        // Defensive: pause() on a constructed-but-never-played element is
        // a no-op in browsers but tests may stub it differently. Swallow.
      }
      audioRef.current = null;
    };
    // We intentionally do not depend on `initialVolume` — the constructor
    // runs once on mount, and a late volume change should flow through
    // `setVolume()` so it can be observed in state-driven UIs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [AudioCtor]);

  const play = useCallback(
    async (url: string): Promise<void> => {
      const audio = audioRef.current;
      if (!audio) {
        throw new ApiError("STREAM_INTERRUPTED", "Audio element not initialized", false);
      }
      cancelledRef.current = false;
      setState({ kind: "loading" });
      audio.src = url;
      try {
        await audio.play();
      } catch (e) {
        // If the caller already stopped/paused us, the play() rejection is
        // a side effect of the cancellation — don't surface it as an
        // error. The state has already been moved to idle/paused by the
        // cancelling call.
        if (cancelledRef.current) return;
        // Autoplay blocked is the canonical NotAllowedError; we let it
        // bubble so the caller can render a "click to play" affordance.
        // Any other play() failure (decode error, network) becomes a
        // stream-interrupted error in state.
        const name = (e as { name?: string })?.name;
        if (name === "NotAllowedError") throw e;
        const message = e instanceof Error ? e.message : "Audio playback failed";
        setState({ kind: "error", code: "STREAM_INTERRUPTED", message });
        throw new ApiError("STREAM_INTERRUPTED", message, true);
      }
    },
    [],
  );

  const pause = useCallback((): void => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
    } catch {
      // Ignored — pause() on an uninitialized element is a no-op.
    }
  }, []);

  const stop = useCallback((): void => {
    const audio = audioRef.current;
    if (!audio) return;
    cancelledRef.current = true;
    try {
      audio.pause();
    } catch {
      // Ignored — see pause().
    }
    audio.currentTime = 0;
    setState({ kind: "idle" });
  }, []);

  const setVolume = useCallback((v: number): void => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = clamp01(v);
  }, []);

  return { state, play, pause, stop, setVolume };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
