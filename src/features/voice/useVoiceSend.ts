"use client";

import { useCallback, useRef, useState } from "react";
import { ApiError, type ErrorCode } from "@/lib/api/errors";
import { useRecorder, type UseRecorder } from "./useRecorder";
import { useAudioPlayer, type UseAudioPlayer } from "./useAudioPlayer";
import { useAuthStore } from "@/stores/auth";
import { useSessionStore } from "@/stores/session";

/**
 * Stream-D push-to-talk state machine surfaced to the chat UI.
 *
 *   idle       — nothing happening
 *   recording  — user is holding the mic button
 *   uploading  — recorder produced a blob, BFF POST in flight
 *   playing    — reply audio is being autoplayed
 *   error      — unrecoverable failure; `code` drives the toast
 */
export type VoiceSendState =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "uploading"; progress: number }
  | { kind: "playing"; replyText: string }
  | { kind: "error"; code: ErrorCode; message: string };

export interface VoiceChatResult {
  transcript: string;
  reply_text: string;
  reply_audio_url: string;
  message_id: string;
}

export interface UseVoiceSend {
  state: VoiceSendState;
  /** Start recording. Idempotent — second call while already recording is a no-op. */
  startRecording(): Promise<void>;
  /**
   * Stop recording, upload, autoplay reply. Resolves with the canonical
   * envelope on success or `null` if the user cancelled / no session is
   * active. Rejects on transport failure (state is flipped to `error`).
   */
  stopAndSend(): Promise<VoiceChatResult | null>;
  /** Cancel mid-recording. No upload, no message append. */
  cancelRecording(): void;
}

export interface UseVoiceSendOptions {
  /** Active session id (required to send). */
  sessionId: string | null;
  /** Active personality id (required to send). */
  personalityId: string | null;
  /** Override the recorder hook (testing). */
  recorder?: UseRecorder;
  /** Override the audio player hook (testing). */
  player?: UseAudioPlayer;
  /**
   * Override the upload transport. Default: `fetch("/api/cozy/voice/chat")`
   * with the bearer token from `useAuthStore`. Tests use this to inject
   * success / failure responses.
   */
  postVoiceChat?: PostVoiceChatFn;
  /** Override the JWT lookup (testing). Default: `useAuthStore.getState().jwt`. */
  getJwt?: () => string;
  /**
   * Override the `AudioCtor` forwarded to the inner `useAudioPlayer` hook.
   * Useful in test environments where jsdom's `HTMLAudioElement` is not a
   * constructible custom element; production callers should leave this unset.
   */
  audioCtor?: new () => HTMLAudioElement;
}

export type PostVoiceChatFn = (
  blob: Blob,
  sessionId: string,
  personalityId: string,
  jwt: string,
) => Promise<VoiceChatResult>;

const VOICE_CHAT_ENDPOINT = "/api/cozy/voice/chat";

/**
 * Default transport: POST the recorded blob as `multipart/form-data` to the
 * BFF voice-chat route. The BFF returns a `{ok, data: {transcript, reply_text,
 * reply_audio_url, message_id}}` envelope. Network failures and non-2xx
 * responses are normalized into an `ApiError` so callers can branch on
 * `err.code`.
 */
async function defaultPostVoiceChat(
  blob: Blob,
  sessionId: string,
  personalityId: string,
  jwt: string,
): Promise<VoiceChatResult> {
  const fd = new FormData();
  fd.append("audio", blob, "recording.webm");
  fd.append("session_id", sessionId);
  fd.append("personality_id", personalityId);

  let res: Response;
  try {
    res = await fetch(VOICE_CHAT_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: fd,
    });
  } catch (e) {
    throw new ApiError(
      "NETWORK_OFFLINE",
      e instanceof Error ? e.message : "Network error",
      true,
    );
  }

  if (!res.ok) {
    let errorBody: { error?: { code?: string; message?: string } } | null = null;
    try {
      errorBody = (await res.json()) as { error?: { code?: string; message?: string } } | null;
    } catch {
      errorBody = null;
    }
    const code = (errorBody?.error?.code as ErrorCode | undefined) ?? "UNKNOWN";
    const message = errorBody?.error?.message ?? `HTTP ${res.status}`;
    throw new ApiError(code, message, res.status >= 500);
  }

  const json = (await res.json()) as { ok: true; data: VoiceChatResult };
  return json.data;
}

/**
 * Composes the M5.1 recorder, the M5.2 audio player, and the M5.3 BFF route
 * into a single push-to-talk state machine. The hook is the single owner of
 * the voice-send lifecycle: chat UI subscribes to `state` and dispatches the
 * three pointer / keyboard events to the three methods.
 *
 * Optimistic message append: a user transcript is appended to the session
 * store before the upload so the chat scrolls immediately. The assistant
 * reply is appended after the BFF responds.
 *
 * Error model:
 *   - `MIC_DENIED` / `MIC_UNSUPPORTED` from the recorder propagate via state.
 *   - `UNAUTHORIZED` from the BFF (401) → state `error` with that code.
 *   - Other BFF / network failures → state `error` with the BFF's code (or
 *     `UNKNOWN` if missing).
 */
export function useVoiceSend(options: UseVoiceSendOptions): UseVoiceSend {
  const {
    sessionId,
    personalityId,
    recorder: recorderOverride,
    player: playerOverride,
    postVoiceChat = defaultPostVoiceChat,
    getJwt,
    audioCtor,
  } = options;

  const [state, setState] = useState<VoiceSendState>({ kind: "idle" });
  // `inFlightRef` guards against double-tap on stop: once we've handed off
  // the blob to the transport, additional stop() calls short-circuit.
  const inFlightRef = useRef(false);

  // Always call both inner hooks to satisfy React's rules of hooks. When
  // the caller supplies overrides, the hooks still run but we route around
  // them — the inner hooks' side effects (recorder MediaRecorder, audio
  // element construction) are gated on `useEffect` callbacks that don't
  // touch jsdom in a meaningful way unless they are actually invoked.
  // `audioCtor` is forwarded to the player so test environments that don't
  // have a constructible `HTMLAudioElement` can supply a stub.
  const defaultRecorder = useRecorder();
  const defaultPlayer = useAudioPlayer({ AudioCtor: audioCtor });
  const recorder = recorderOverride ?? defaultRecorder;
  const player = playerOverride ?? defaultPlayer;

  const resolveJwt = useCallback((): string => {
    if (getJwt) return getJwt();
    return useAuthStore.getState().jwt;
  }, [getJwt]);

  const startRecording = useCallback(async (): Promise<void> => {
    if (!sessionId || !personalityId) {
      return;
    }
    // Recover from a prior error so the user can retry without re-mounting.
    if (state.kind === "recording") return;
    setState({ kind: "idle" });
    try {
      await recorder.start();
      setState({ kind: "recording" });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("MIC_DENIED", String(e), false);
      setState({ kind: "error", code: err.code as ErrorCode, message: err.message });
    }
  }, [personalityId, recorder, sessionId, state.kind]);

  const stopAndSend = useCallback(async (): Promise<VoiceChatResult | null> => {
    if (inFlightRef.current) return null;
    if (!sessionId || !personalityId) return null;
    if (recorder.state.kind !== "recording") return null;

    inFlightRef.current = true;
    setState({ kind: "uploading", progress: 0 });

    let blob: Blob;
    try {
      blob = await recorder.stop();
    } catch (e) {
      inFlightRef.current = false;
      const err = e instanceof ApiError ? e : new ApiError("MIC_UNSUPPORTED", String(e), false);
      setState({ kind: "error", code: err.code as ErrorCode, message: err.message });
      return null;
    }

    // Optimistic transcript append: the user sees their own message
    // immediately. We don't have the transcript until the BFF responds, so
    // we append a placeholder that the reply will sit alongside.
    const userMessageId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `voice-${Date.now()}-user`;
    useSessionStore.getState().appendMessage({
      id: userMessageId,
      role: "user",
      content: "🎤 …", // placeholder until the BFF returns the transcript
      status: "sending",
    });

    const jwt = resolveJwt();
    let result: VoiceChatResult;
    try {
      result = await postVoiceChat(blob, sessionId, personalityId, jwt);
    } catch (e) {
      inFlightRef.current = false;
      const err = e instanceof ApiError ? e : new ApiError("UNKNOWN", String(e), true);
      setState({ kind: "error", code: err.code as ErrorCode, message: err.message });
      // Mark the optimistic user message as errored so the chat shows it.
      useSessionStore.getState().markError(userMessageId, err.code as ErrorCode);
      return null;
    }

    // Replace the optimistic placeholder with the canonical transcript.
    useSessionStore.setState((s) => ({
      messages: s.messages.map((m) =>
        m.id === userMessageId ? { ...m, content: result.transcript, status: "done" } : m,
      ),
    }));

    useSessionStore.getState().appendMessage({
      id: result.message_id,
      role: "assistant",
      content: result.reply_text,
      status: "done",
    });

    setState({ kind: "playing", replyText: result.reply_text });
    inFlightRef.current = false;

    // Autoplay reply audio. Failure here is non-fatal — the user can replay
    // it from the chat history. We don't want to clobber the optimistic
    // assistant append with an error state.
    try {
      await player.play(result.reply_audio_url);
    } catch {
      // Swallow — see comment above.
    }
    // Move back to idle after the user gets a chance to see the result.
    setState({ kind: "idle" });
    return result;
  }, [personalityId, player, postVoiceChat, recorder, resolveJwt, sessionId]);

  const cancelRecording = useCallback((): void => {
    if (recorder.state.kind === "recording") {
      recorder.cancel();
    }
    if (state.kind !== "idle") setState({ kind: "idle" });
  }, [recorder, state.kind]);

  return { state, startRecording, stopAndSend, cancelRecording };
}
