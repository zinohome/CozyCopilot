"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type ErrorCode } from "@/lib/api/errors";
import {
  LIVEKIT_TOKEN_ENDPOINT,
  LIVEKIT_URL,
  VOICE_SUMMARY_ENDPOINT,
} from "./livekit-config";
import { useAuthStore } from "@/stores/auth";

/**
 * Discriminated union representing the realtime voice-call lifecycle.
 *
 *   idle        — nothing happening
 *   connecting  — token requested / room.connect() in flight
 *   connected   — joined the LiveKit room, mic publishing
 *   active      — user is in the call; `speaking` reflects mic activity
 *   ending      — user pressed hangup, summary upload in flight
 *   ended       — call finished cleanly; `summary` is the captured transcript
 *   error       — unrecoverable failure; `canFallback` toggles the "switch to
 *                 text" CTA in the panel
 */
export type RealtimeState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "active"; speaking: boolean }
  | { kind: "ending" }
  | { kind: "ended"; summary?: RealtimeSummary }
  | { kind: "error"; code: ErrorCode; message: string; canFallback: boolean };

export interface RealtimeTurn {
  role: "user" | "assistant";
  text: string;
  at: string;
}

export interface RealtimeToolCall {
  name: string;
  arguments: unknown;
  result?: unknown;
}

export interface RealtimeSummary {
  session_id: string;
  turns: RealtimeTurn[];
  tool_calls: RealtimeToolCall[];
}

export interface UseRealtime {
  state: RealtimeState;
  /** Start a voice call. Requires active session + personality IDs. */
  start: (opts: { sessionId: string; personalityId: string }) => Promise<void>;
  /** Mute / unmute mic while connected. */
  setMicEnabled: (enabled: boolean) => Promise<void>;
  /** User-initiated hangup. Triggers summary upload. */
  hangup: () => Promise<void>;
  /** The most recent summary from a completed call. */
  lastSummary: RealtimeSummary | null;
}

interface LiveKitTokenResponse {
  ok: boolean;
  data?: { token?: string; url?: string };
}

/**
 * Minimal shape of the `livekit-client` types we touch. Defined locally so the
 * file compiles without pulling the package's full type surface at the top
 * level (the actual module is lazy-imported inside `start()`).
 */
interface LiveKitRoom {
  connect(url: string, token: string): Promise<void>;
  disconnect(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  localParticipant: {
    setMicrophoneEnabled(enabled: boolean): Promise<void>;
  };
}

interface LiveKitModule {
  Room: new () => LiveKitRoom;
  RoomEvent: Record<string, string>;
}

interface AudioTrackLike {
  attach(el: HTMLMediaElement): void;
  detach(): HTMLMediaElement[];
}

/**
 * `livekit-client` is a browser-only bundle — it imports `navigator`,
 * `WebSocket`, and `MediaStream` at module scope. The Next.js server build
 * refuses to evaluate it. We therefore dynamic-import the module inside
 * `start()` so the SSR pass and the chat-only page never see it.
 *
 * The hook itself is React glue around a single `LiveKitModule` instance;
 * the state machine is the source of truth — the room is just an effect
 * target.
 */
export function useRealtime(): UseRealtime {
  const [state, setState] = useState<RealtimeState>({ kind: "idle" });
  const [lastSummary, setLastSummary] = useState<RealtimeSummary | null>(null);

  // Refs hold the live LiveKit handles across renders without retriggering
  // effects. `roomRef` is null in `idle`; `audioElRef` points at the hidden
  // <audio> element we attach remote tracks to.
  const roomRef = useRef<LiveKitRoom | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const turnsRef = useRef<RealtimeTurn[]>([]);
  const toolCallsRef = useRef<RealtimeToolCall[]>([]);
  const sessionIdRef = useRef<string>("");
  const cleanupListenersRef = useRef<(() => void) | null>(null);
  // Guards against re-entrancy: `start()` may be called while the previous
  // call is still tearing down. The tokenize→connect sequence is async; we
  // don't want a duplicate room to be created.
  const startingRef = useRef(false);

  // Latest JWT — read from the auth store on every call so the hook stays
  // reactive to login/logout without an explicit dependency.
  const jwt = useAuthStore((s) => s.jwt);

  const setErrorState = useCallback((message: string, code: ErrorCode = "LIVEKIT_FAILED") => {
    setState({
      kind: "error",
      code,
      message,
      canFallback: true,
    });
  }, []);

  /**
   * Register the per-room listeners. Returns a cleanup that removes them.
   * We hold the listener functions in a closure so `off()` gets the exact
   * same references.
   */
  const wireRoom = useCallback(
    (room: LiveKitRoom, RoomEvent: Record<string, string>, audioEl: HTMLAudioElement) => {
      const onConnected = () => {
        setState((prev) => (prev.kind === "connecting" ? { kind: "connected" } : prev));
      };
      const onDisconnected = () => {
        // Spontaneous disconnect (network drop). If the user already pressed
        // hangup we will be in `ending`/`ended`; don't overwrite that.
        setState((prev) => {
          if (prev.kind === "ending" || prev.kind === "ended") return prev;
          return {
            kind: "error",
            code: "LIVEKIT_FAILED",
            message: "语音通话连接已断开",
            canFallback: true,
          };
        });
      };
      const onTrackSubscribed = (
        _track: unknown,
        publication: { kind?: string },
        _participant: unknown,
      ) => {
        // We only auto-attach audio tracks. Video is out of scope for v1.
        if (publication.kind !== "audio") return;
        const audioTrack = _track as unknown as AudioTrackLike;
        try {
          audioTrack.attach(audioEl);
        } catch {
          // attachment failures should not crash the call; the user just
          // won't hear the AI until they reconnect.
        }
      };
      const onActiveSpeakers = (speakers: Array<{ isSpeaking?: boolean }>) => {
        const userSpeaking = speakers.some((s) => s.isSpeaking);
        setState((prev) =>
          prev.kind === "active" ? { kind: "active", speaking: userSpeaking } : prev,
        );
      };
      const onData = (payload: Uint8Array, _participant: unknown) => {
        // Data channel protocol is a JSON blob: {role, text, at, tool_calls?}.
        // We don't have a finalized wire spec yet, so be lenient — fall
        // through to text-only if the payload is malformed.
        try {
          const text = new TextDecoder().decode(payload);
          const parsed = JSON.parse(text) as Partial<{
            role: "user" | "assistant";
            text: string;
            at: string;
            tool_calls: RealtimeToolCall[];
          }>;
          if (parsed.role && parsed.text) {
            turnsRef.current.push({
              role: parsed.role,
              text: parsed.text,
              at: parsed.at ?? new Date().toISOString(),
            });
          }
          if (Array.isArray(parsed.tool_calls)) {
            toolCallsRef.current.push(...parsed.tool_calls);
          }
        } catch {
          // Malformed data channel frame — ignore.
        }
      };

      room.on(RoomEvent.Connected, onConnected);
      room.on(RoomEvent.Disconnected, onDisconnected);
      room.on(RoomEvent.TrackSubscribed, onTrackSubscribed as unknown as () => void);
      room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakers as unknown as () => void);
      room.on(RoomEvent.DataReceived, onData as unknown as () => void);

      return () => {
        room.off(RoomEvent.Connected, onConnected);
        room.off(RoomEvent.Disconnected, onDisconnected);
        room.off(RoomEvent.TrackSubscribed, onTrackSubscribed as unknown as () => void);
        room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakers as unknown as () => void);
        room.off(RoomEvent.DataReceived, onData as unknown as () => void);
      };
    },
    [],
  );

  const start: UseRealtime["start"] = useCallback(
    async ({ sessionId, personalityId }) => {
      if (startingRef.current) return;
      startingRef.current = true;

      setState({ kind: "connecting" });
      sessionIdRef.current = sessionId;
      turnsRef.current = [];
      toolCallsRef.current = [];

      // Ensure the hidden audio element exists. The hook owns its lifecycle
      // so callers (e.g. RealtimePanel) can either create one and pass it via
      // `audioElRef.current`, or let the hook mount one lazily. We mount
      // lazily: the next effect attaches to `document.body` if absent.
      let audioEl = audioElRef.current;
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioEl.setAttribute("data-realtime-audio", "true");
        audioEl.style.display = "none";
        document.body.appendChild(audioEl);
        audioElRef.current = audioEl;
      }

      try {
        // 1. Lazy-import — keep `livekit-client` out of the SSR bundle.
        const lk = (await import("livekit-client")) as unknown as LiveKitModule;
        const { Room, RoomEvent } = lk;

        // 2. Fetch a LiveKit token from the BFF.
        const tokenRes = await fetch(LIVEKIT_TOKEN_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            personality_id: personalityId,
          }),
        });
        if (!tokenRes.ok) {
          throw new ApiError("LIVEKIT_FAILED", `Token request failed: ${tokenRes.status}`, true);
        }
        const tokenJson = (await tokenRes.json()) as LiveKitTokenResponse;
        const token = tokenJson.data?.token;
        const url = tokenJson.data?.url ?? LIVEKIT_URL;
        if (!token) {
          throw new ApiError("LIVEKIT_FAILED", "Token response missing token field", false);
        }

        // 3. Connect.
        const room = new Room();
        roomRef.current = room;
        cleanupListenersRef.current = wireRoom(room, RoomEvent, audioEl);

        await room.connect(url, token);
        // Connected listener flips state to `connected`; if the listener
        // already fired before we resumed, we may already be `connected`.

        // 4. Enable the mic — this triggers the publisher negotiation and
        // also flips us to `active` once the local track is set up.
        await room.localParticipant.setMicrophoneEnabled(true);
        setState({ kind: "active", speaking: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorState(message);
        // Best-effort cleanup so a partial connect doesn't leak.
        try {
          await roomRef.current?.disconnect();
        } catch {
          /* swallow */
        }
        cleanupListenersRef.current?.();
        cleanupListenersRef.current = null;
        roomRef.current = null;
      } finally {
        startingRef.current = false;
      }
    },
    [jwt, setErrorState, wireRoom],
  );

  const setMicEnabled: UseRealtime["setMicEnabled"] = useCallback(
    async (enabled) => {
      const room = roomRef.current;
      if (!room) {
        throw new ApiError("LIVEKIT_FAILED", "No active room", false);
      }
      await room.localParticipant.setMicrophoneEnabled(enabled);
      setState((prev) =>
        prev.kind === "active" ? { kind: "active", speaking: enabled } : prev,
      );
    },
    [],
  );

  const uploadSummary = useCallback(
    async (summary: RealtimeSummary): Promise<void> => {
      // Best-effort POST. A 404 here is acceptable — M5.6 BFF may not exist
      // yet. We swallow everything except network errors so the user-facing
      // state can still move to `ended`.
      try {
        await fetch(VOICE_SUMMARY_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify(summary),
        });
      } catch {
        // Network error — the summary is kept in `lastSummary` and the
        // caller can retry later if desired.
      }
    },
    [jwt],
  );

  const hangup: UseRealtime["hangup"] = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;

    setState({ kind: "ending" });
    const summary: RealtimeSummary = {
      session_id: sessionIdRef.current,
      turns: turnsRef.current.slice(),
      tool_calls: toolCallsRef.current.slice(),
    };

    try {
      await room.disconnect();
    } catch {
      // Disconnect errors are non-fatal — the room is going away anyway.
    } finally {
      cleanupListenersRef.current?.();
      cleanupListenersRef.current = null;
      roomRef.current = null;
    }

    await uploadSummary(summary);
    setLastSummary(summary);
    setState({ kind: "ended", summary });
  }, [uploadSummary]);

  // Cleanup on unmount: if the consumer navigates away mid-call, don't leak
  // the room connection.
  useEffect(() => {
    return () => {
      cleanupListenersRef.current?.();
      void roomRef.current?.disconnect().catch(() => undefined);
      const el = audioElRef.current;
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
      audioElRef.current = null;
      roomRef.current = null;
    };
  }, []);

  return { state, start, setMicEnabled, hangup, lastSummary };
}
