"use client";

import { useCallback, useRef, useState } from "react";
import { ApiError, type ErrorCode } from "@/lib/api/errors";

export type RecorderState =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "processing" }
  | { kind: "error"; code: ErrorCode; message: string };

export interface UseRecorderOptions {
  /** Override the audio-capture factory (testing). Defaults to `navigator.mediaDevices.getUserMedia({audio:true})`. */
  getMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  /** Override MediaRecorder constructor (testing). */
  MediaRecorderCtor?: typeof MediaRecorder;
  /** Audio MIME type. Default `audio/webm;codecs=opus` per spec. */
  mimeType?: string;
}

export interface UseRecorder {
  state: RecorderState;
  /** Start recording. Idempotent — calls during `recording` are no-ops. */
  start(): Promise<void>;
  /** Stop recording, resolve with the recorded `Blob`. Errors flip state to `error`. */
  stop(): Promise<Blob>;
  /** Cancel mid-recording without producing a blob. */
  cancel(): void;
}

const DEFAULT_MIME = "audio/webm;codecs=opus";

/**
 * Default `getUserMedia` factory. Throws a `MIC_DENIED` ApiError if
 * `navigator.mediaDevices` is missing (SSR / jsdom) so callers don't have
 * to handle a bare `TypeError`. We let the browser's native DOMException
 * surface for actual permission rejections — `useRecorder` catches it and
 * re-tags it as `MIC_DENIED` to keep the UI message stable.
 */
async function defaultGetMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new ApiError("MIC_UNSUPPORTED", "navigator.mediaDevices.getUserMedia unavailable", false);
  }
  return navigator.mediaDevices.getUserMedia(constraints);
}

/**
 * React hook that wraps the `MediaRecorder` API and surfaces recording state
 * to the UI as a discriminated union. The hook itself does not own a
 * `MediaStream` between calls — tracks are released via `cancel()` and the
 * implicit stream teardown when the `MediaRecorder` is discarded.
 *
 * Error model mirrors `useUpload`: failures are stored in state AND thrown
 * to the caller so a `try/catch` in the component can branch on
 * `err.code`. Codes used:
 *   - `MIC_DENIED` — `getUserMedia` rejected (permission blocked / no device)
 *   - `MIC_UNSUPPORTED` — `MediaRecorder` constructor threw (no codec match)
 *
 * `start()` is idempotent so accidental double-tap on the mic button does
 * not open two parallel streams. `cancel()` stops the underlying recorder
 * but discards collected chunks — callers who want the audio must use
 * `stop()`.
 */
export function useRecorder(options: UseRecorderOptions = {}): UseRecorder {
  const { getMedia = defaultGetMedia, MediaRecorderCtor, mimeType = DEFAULT_MIME } = options;

  const [state, setState] = useState<RecorderState>({ kind: "idle" });

  // Refs hold the live recorder and chunk buffer across renders without
  // forcing a re-render every time a chunk arrives. The recorder is also
  // kept off-state so we can call `.stop()` from `cancel()` without
  // re-creating it.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  const releaseStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  const start = useCallback(async (): Promise<void> => {
    // Idempotent: a second `start()` while already recording is a no-op so
    // the UI's double-tap guard doesn't fight with the hook.
    if (state.kind === "recording") return;

    setState({ kind: "idle" });
    try {
      const stream = await getMedia({ audio: true });
      streamRef.current = stream;

      const Ctor: typeof MediaRecorder | undefined =
        MediaRecorderCtor ??
        (typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined);
      if (!Ctor) {
        releaseStream();
        throw new ApiError("MIC_UNSUPPORTED", "MediaRecorder unavailable in this environment", false);
      }

      let recorder: MediaRecorder;
      try {
        recorder = new Ctor(stream, { mimeType });
      } catch (e) {
        // Constructor throws when the browser refuses the requested codec.
        // We tear down the stream immediately so we don't leak the mic
        // indicator on the OS level.
        releaseStream();
        throw new ApiError(
          "MIC_UNSUPPORTED",
          e instanceof Error ? e.message : "MediaRecorder rejected mimeType",
          false,
        );
      }

      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onerror = (ev: Event) => {
        // onerror fires for runtime recorder failures (e.g. device
        // unplugged mid-record). Surface as MIC_UNSUPPORTED so the UI can
        // show the same fallback as for codec refusal.
        const message = (ev as { error?: { message?: string } }).error?.message ?? "MediaRecorder error";
        setState({ kind: "error", code: "MIC_UNSUPPORTED", message });
        releaseStream();
      };

      recorderRef.current = recorder;
      recorder.start();
      setState({ kind: "recording", startedAt: Date.now() });
    } catch (e) {
      releaseStream();
      const err =
        e instanceof ApiError
          ? e
          : new ApiError("MIC_DENIED", e instanceof Error ? e.message : String(e), false);
      setState({ kind: "error", code: err.code as ErrorCode, message: err.message });
      throw err;
    }
  }, [MediaRecorderCtor, getMedia, mimeType, releaseStream, state.kind]);

  const stop = useCallback((): Promise<Blob> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      // Nothing to stop — caller is invoking stop() before start()
      // succeeded. Reject so the caller's UI can short-circuit.
      const err = new ApiError("MIC_UNSUPPORTED", "Recorder is not active", false);
      setState({ kind: "error", code: err.code as ErrorCode, message: err.message });
      return Promise.reject(err);
    }

    setState({ kind: "processing" });
    cancelledRef.current = false;

    return new Promise<Blob>((resolve, reject) => {
      const handleStop = () => {
        try {
          recorder.removeEventListener("dataavailable", handleData);
          recorder.removeEventListener("stop", handleStop);
          recorder.removeEventListener("error", handleError);

          if (cancelledRef.current) {
            releaseStream();
            chunksRef.current = [];
            recorderRef.current = null;
            setState({ kind: "idle" });
            return;
          }

          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];
          recorderRef.current = null;
          releaseStream();
          setState({ kind: "idle" });
          resolve(blob);
        } catch (e) {
          const err = e instanceof ApiError ? e : new ApiError("MIC_UNSUPPORTED", String(e), false);
          const errorState: RecorderState = {
            kind: "error",
            code: err.code as ErrorCode,
            message: err.message,
          };
          setState(errorState);
          reject(err);
        }
      };

      const handleData = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      const handleError = (ev: Event) => {
        recorder.removeEventListener("dataavailable", handleData);
        recorder.removeEventListener("stop", handleStop);
        recorder.removeEventListener("error", handleError);
        const message = (ev as { error?: { message?: string } }).error?.message ?? "MediaRecorder error";
        releaseStream();
        const err = new ApiError("MIC_UNSUPPORTED", message, false);
        setState({ kind: "error", code: err.code as ErrorCode, message: err.message });
        reject(err);
      };

      recorder.addEventListener("dataavailable", handleData);
      recorder.addEventListener("stop", handleStop);
      recorder.addEventListener("error", handleError);
      recorder.stop();
    });
  }, [mimeType, releaseStream]);

  const cancel = useCallback((): void => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setState({ kind: "idle" });
      return;
    }
    cancelledRef.current = true;
    // Suppress the dataavailable handler chain so we don't keep pushing
    // chunks into the buffer while the recorder is winding down.
    recorder.ondataavailable = null;
    recorder.onerror = null;
    try {
      recorder.stop();
    } catch {
      // Some browsers throw if stop() is called outside an active state;
      // safe to ignore here — the state-machine reset below handles it.
    }
    chunksRef.current = [];
    releaseStream();
    recorderRef.current = null;
    setState({ kind: "idle" });
  }, [releaseStream]);

  return { state, start, stop, cancel };
}
