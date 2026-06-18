import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVoiceSend, type PostVoiceChatFn } from "./useVoiceSend";
import { useSessionStore } from "@/stores/session";
import { useAuthStore } from "@/stores/auth";
import type { UseRecorder } from "./useRecorder";
import type { UseAudioPlayer } from "./useAudioPlayer";

// We stub the recorder and audio player hooks so the test doesn't depend on
// jsdom's missing MediaRecorder / HTMLAudioElement globals. The fakes mimic
// the parts of the real surface that `useVoiceSend` actually calls.
function makeRecorderStub(overrides: Partial<UseRecorder> = {}): UseRecorder {
  let onStop: ((blob: Blob) => void) | null = null;
  const stub: UseRecorder = {
    state: { kind: "idle" },
    start: vi.fn(async () => {
      stub.state = { kind: "recording", startedAt: Date.now() };
    }),
    stop: vi.fn(() => {
      const blob = new Blob([new Uint8Array(8)], { type: "audio/webm" });
      stub.state = { kind: "idle" };
      onStop?.(blob);
      return Promise.resolve(blob);
    }),
    cancel: vi.fn(() => {
      stub.state = { kind: "idle" };
    }),
    ...overrides,
  };
  // Allow tests to await the stop() resolution.
  (stub as { _onStop?: (cb: (blob: Blob) => void) => void })._onStop = (cb) => {
    onStop = cb;
  };
  return stub;
}

function makePlayerStub(): UseAudioPlayer {
  return {
    state: { kind: "idle" },
    play: vi.fn(async () => {
      // No-op; tests don't assert on player state.
    }),
    pause: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
  };
}

const SESSION = "sess-1";
const PERSONALITY = "pers-1";

function renderVoiceSend(
  options: {
    postVoiceChat?: PostVoiceChatFn;
    recorder?: UseRecorder;
    player?: UseAudioPlayer;
    getJwt?: () => string;
    sessionId?: string | null;
    personalityId?: string | null;
  } = {},
) {
  const recorder = options.recorder ?? makeRecorderStub();
  const player = options.player ?? makePlayerStub();
  // jsdom 25 ships an `HTMLAudioElement` that throws when constructed via
  // `new` (it's registered as a custom-element-style constructor). We
  // inject a no-op `AudioCtor` so the inner `useAudioPlayer()` hook — which
  // is still called to satisfy React's rules of hooks — can mount cleanly.
  // The test asserts on the `player` stub we pass via override, so this
  // never has to actually play audio.
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
  // `sessionId` / `personalityId` default to SESSION/PERSONALITY only when
  // the option is *omitted entirely*; explicit `null` must propagate so the
  // "no-op when null" test case sees the disabled state.
  const sessionId: string | null =
    "sessionId" in options ? (options.sessionId ?? null) : SESSION;
  const personalityId: string | null =
    "personalityId" in options ? (options.personalityId ?? null) : PERSONALITY;
  const result = renderHook(() =>
    useVoiceSend({
      sessionId,
      personalityId,
      recorder,
      player,
      postVoiceChat: options.postVoiceChat,
      getJwt: options.getJwt ?? (() => "test-jwt"),
      audioCtor,
    }),
  );
  return { ...result, recorder, player };
}

beforeEach(() => {
  // Reset both stores between tests so message appends don't leak.
  useSessionStore.getState().clear();
  useAuthStore.setState({ jwt: "test-jwt", userId: "u1", email: "u@x", role: "user" });
});

describe("useVoiceSend", () => {
  it("startRecording flips state to recording", async () => {
    const { result, recorder } = renderVoiceSend();
    expect(result.current.state).toEqual({ kind: "idle" });

    await act(async () => {
      await result.current.startRecording();
    });

    expect(recorder.start).toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: "recording" });
  });

  it("stopAndSend after recording flows uploading → playing → idle and returns the result", async () => {
    const postVoiceChat = vi.fn<PostVoiceChatFn>(async () => ({
      transcript: "hello",
      reply_text: "hi there",
      reply_audio_url: "https://cdn.example.com/r.mp3",
      message_id: "msg-1",
    }));
    const player = makePlayerStub();
    const { result, recorder } = renderVoiceSend({ postVoiceChat, player });

    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.state).toEqual({ kind: "recording" });

    let returned: unknown = "unset";
    await act(async () => {
      returned = await result.current.stopAndSend();
    });

    expect(recorder.stop).toHaveBeenCalled();
    expect(postVoiceChat).toHaveBeenCalledTimes(1);
    const [blob, sid, pid, jwt] = postVoiceChat.mock.calls[0]!;
    expect(blob).toBeInstanceOf(Blob);
    expect(sid).toBe(SESSION);
    expect(pid).toBe(PERSONALITY);
    expect(jwt).toBe("test-jwt");

    expect(returned).toEqual({
      transcript: "hello",
      reply_text: "hi there",
      reply_audio_url: "https://cdn.example.com/r.mp3",
      message_id: "msg-1",
    });

    // Assistant message was appended to the session store with status "done".
    const messages = useSessionStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("hello");
    expect(messages[0]?.status).toBe("done");
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.content).toBe("hi there");
    expect(messages[1]?.status).toBe("done");

    expect(player.play).toHaveBeenCalledWith("https://cdn.example.com/r.mp3");
  });

  it("cancelRecording returns state to idle and does not call the transport", async () => {
    const postVoiceChat = vi.fn<PostVoiceChatFn>();
    const { result, recorder } = renderVoiceSend({ postVoiceChat });

    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.state).toEqual({ kind: "recording" });

    act(() => {
      result.current.cancelRecording();
    });

    expect(recorder.cancel).toHaveBeenCalled();
    expect(postVoiceChat).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: "idle" });
    expect(useSessionStore.getState().messages).toHaveLength(0);
  });

  it("401 from BFF flips state to error with UNAUTHORIZED and marks user message as errored", async () => {
    const postVoiceChat = vi.fn<PostVoiceChatFn>(async () => {
      throw new (await import("@/lib/api/errors")).ApiError("UNAUTHORIZED", "no token", false);
    });
    const { result } = renderVoiceSend({ postVoiceChat });

    await act(async () => {
      await result.current.startRecording();
    });
    await act(async () => {
      await result.current.stopAndSend();
    });

    expect(result.current.state.kind).toBe("error");
    if (result.current.state.kind === "error") {
      expect(result.current.state.code).toBe("UNAUTHORIZED");
    }
    // Optimistic user message exists, marked as error.
    const messages = useSessionStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.status).toBe("error");
  });

  it("startRecording is a no-op when sessionId is null", async () => {
    const { result, recorder } = renderVoiceSend({ sessionId: null });
    await act(async () => {
      await result.current.startRecording();
    });
    expect(recorder.start).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: "idle" });
  });

  it("recorder start() rejection flips state to error with MIC_DENIED", async () => {
    const recorder = makeRecorderStub({
      start: vi.fn(async () => {
        throw new (await import("@/lib/api/errors")).ApiError("MIC_DENIED", "blocked", false);
      }),
    });
    const { result } = renderVoiceSend({ recorder });

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.state).toEqual({
      kind: "error",
      code: "MIC_DENIED",
      message: "blocked",
    });
  });
});
