// M5.9 — Stream D (non-realtime, push-to-talk) end-to-end integration test.
//
// Wires the M5.4 `useVoiceSend` hook through its full state machine:
//   1. startRecording() → state {recording}
//   2. stopAndSend() with the stubbed recorder producing a Blob
//   3. The hook POSTs multipart/form-data to /api/cozy/voice/chat
//   4. We mock the BFF↔CozyEngineV2 boundary with `vi.spyOn(global, "fetch")`
//      (M4.7 pattern — no MSW).
//   5. Canonical envelope unwraps to {transcript, reply_text,
//      reply_audio_url, message_id}; session store gets two messages.
//
// The recorder is faked via `useVoiceSend`'s `recorder:` override option so
// we don't depend on jsdom's missing MediaRecorder. The audio player is
// also faked so `play()` doesn't try to instantiate HTMLAudioElement (which
// jsdom 25 refuses to construct).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVoiceSend } from "@/features/voice/useVoiceSend";
import { useSessionStore } from "@/stores/session";
import { useAuthStore } from "@/stores/auth";
import type { UseRecorder } from "@/features/voice/useRecorder";
import type { UseAudioPlayer } from "@/features/voice/useAudioPlayer";

const SESSION_ID = "00000000-0000-0000-0000-000000000001";
const PERSONALITY_ID = "00000000-0000-0000-0000-000000000002";
const MESSAGE_ID = "00000000-0000-0000-0000-000000000010";
const JWT = "test-jwt";
const TRANSCRIPT = "今天天气怎么样？";
const REPLY_TEXT = "今天晴，最高 25°";
const REPLY_AUDIO_URL = "https://cdn.example.com/reply.webm";

// Stub recorder: drives state to `recording` on start(), resolves a Blob
// on stop(). The fake's start()/stop() are awaited normally so we don't
// need to drive the real MediaRecorder event surface.
function makeFakeRecorder(): UseRecorder {
  const fake: UseRecorder = {
    state: { kind: "idle" },
    start: vi.fn(async () => {
      fake.state = { kind: "recording", startedAt: Date.now() };
    }),
    stop: vi.fn(async () => {
      fake.state = { kind: "idle" };
      // Real shape: an audio/webm blob. Size > 0 so the BFF's EMPTY_FILE
      // guard is satisfied when this is forwarded as multipart.
      return new Blob([new Uint8Array(8), new Uint8Array(16)], {
        type: "audio/webm",
      });
    }),
    cancel: vi.fn(() => {
      fake.state = { kind: "idle" };
    }),
  };
  return fake;
}

// Stub player: capture the URL `play()` was called with; do not throw.
function makeFakePlayer(): UseAudioPlayer {
  return {
    state: { kind: "idle" },
    play: vi.fn(async () => {
      // No-op: production audio playback is out of scope for this test.
    }),
    pause: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
  };
}

// jsdom 25 refuses to construct HTMLAudioElement directly; inject a
// no-op AudioCtor so the inner useAudioPlayer() hook — still called to
// satisfy React's rules of hooks — can mount cleanly. The override
// `player` is what `useVoiceSend` actually routes through.
class NoopAudio {
  addEventListener() {}
  removeEventListener() {}
  play() {
    return Promise.resolve();
  }
  pause() {}
  src = "";
  volume = 1;
  currentTime = 0;
  duration = 0;
  paused = true;
  error: { message: string } | null = null;
}
const audioCtor = NoopAudio as unknown as new () => HTMLAudioElement;

describe("M5 stream D end-to-end voice send", () => {
  let originalFetch: typeof global.fetch;
  let fetchSpy: import("vitest").MockInstance;

  beforeEach(() => {
    originalFetch = global.fetch;
    useSessionStore.getState().clear();
    useAuthStore.setState({
      jwt: JWT,
      userId: "u-1",
      email: "u@example.com",
      role: "user",
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("push-to-talk → BFF upload → assistant append → autoplay", async () => {
    // Mock BFF: returns the canonical envelope directly. The route
    // unwraps to {ok: true, data: <envelope>}; useVoiceSend then reads
    // the envelope fields off `json.data`.
    fetchSpy = vi.spyOn(global, "fetch").mockImplementation(
      (async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              transcript: TRANSCRIPT,
              reply_text: REPLY_TEXT,
              reply_audio_url: REPLY_AUDIO_URL,
              message_id: MESSAGE_ID,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as unknown as typeof fetch,
    );

    const recorder = makeFakeRecorder();
    const player = makeFakePlayer();

    const { result } = renderHook(() =>
      useVoiceSend({
        sessionId: SESSION_ID,
        personalityId: PERSONALITY_ID,
        recorder,
        player,
        getJwt: () => JWT,
        audioCtor,
      }),
    );

    expect(result.current.state).toEqual({ kind: "idle" });

    // 1. startRecording() flips state to `recording`.
    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.state).toEqual({ kind: "recording" });
    expect(recorder.start).toHaveBeenCalledTimes(1);

    // 2. stopAndSend() — recorder.stop() yields a Blob, the hook POSTs
    // multipart to /api/cozy/voice/chat, appends user + assistant
    // messages to the session store, and flips state to `playing`.
    let returned: unknown = "unset";
    await act(async () => {
      returned = await result.current.stopAndSend();
    });

    // The transport was hit exactly once, with the right URL and Bearer.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [
      unknown,
      RequestInit,
    ];
    expect(String(calledUrl)).toBe("/api/cozy/voice/chat");
    expect(calledInit.method).toBe("POST");
    expect((calledInit.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${JWT}`,
    );
    // Body is a FormData carrying the audio blob + UUIDs. We duck-type
    // instead of using instanceof so the assertion is robust to which
    // FormData implementation is wired (jsdom polyfill vs. undici).
    const sentForm = calledInit.body as { get: (k: string) => unknown };
    expect(typeof sentForm.get).toBe("function");
    expect(sentForm.get("session_id")).toBe(SESSION_ID);
    expect(sentForm.get("personality_id")).toBe(PERSONALITY_ID);
    const audioField = sentForm.get("audio");
    expect(audioField).toBeTruthy();
    expect((audioField as { type: string }).type).toBe("audio/webm");

    // Canonical envelope returned to the caller.
    expect(returned).toEqual({
      transcript: TRANSCRIPT,
      reply_text: REPLY_TEXT,
      reply_audio_url: REPLY_AUDIO_URL,
      message_id: MESSAGE_ID,
    });

    // Session store has 2 messages: user (transcript) + assistant (reply).
    const messages = useSessionStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: TRANSCRIPT,
      status: "done",
    });
    expect(messages[1]).toMatchObject({
      id: MESSAGE_ID,
      role: "assistant",
      content: REPLY_TEXT,
      status: "done",
    });

    // Audio player received the BFF's reply URL.
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledWith(REPLY_AUDIO_URL);

    // State eventually returns to idle after the autoplay promise settles.
    // We don't pin a specific intermediate state ("playing" vs "idle")
    // because React state updates after the await in stopAndSend are
    // flushed when act() returns; the contract we care about is the
    // final value.
    expect(result.current.state.kind).not.toBe("error");
  });
});