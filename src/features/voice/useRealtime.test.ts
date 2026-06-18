import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Mock the `livekit-client` module BEFORE importing the hook. The dynamic
// import inside `start()` is resolved by Vitest's module loader the same way
// as a top-level import — `vi.mock` factory is consulted on every import.
vi.mock("livekit-client", () => {
  const RoomEvent = {
    Connected: "connected",
    Disconnected: "disconnected",
    TrackSubscribed: "trackSubscribed",
    ActiveSpeakersChanged: "activeSpeakersChanged",
    DataReceived: "dataReceived",
  };
  const fakeRoom = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    localParticipant: {
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    },
  };
  return {
    Room: vi.fn().mockImplementation(() => fakeRoom),
    RoomEvent,
  };
});

import { useAuthStore } from "@/stores/auth";
import { useRealtime } from "./useRealtime";

// Helper: pull a listener that was registered via `room.on(event, fn)`.
function getListener(room: { on: Mock }, event: string) {
  const call = (room.on as Mock).mock.calls.find((c) => c[0] === event);
  if (!call) throw new Error(`No listener registered for ${event}`);
  return call[1] as (...args: unknown[]) => void;
}

describe("useRealtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ jwt: "test-jwt", userId: "u-1", email: "a@b.c", role: "user" });

    // Default fetch mock: success for the token endpoint. The summary
    // endpoint mock is wired per-test as needed.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { token: "lk-token", url: "wss://lk" } }),
    }) as unknown as typeof fetch;
  });

  it("starts in `idle`", () => {
    const { result } = renderHook(() => useRealtime());
    expect(result.current.state).toEqual({ kind: "idle" });
  });

  it("start() flips to `connecting`, then `active` after mic enable", async () => {
    const { result } = renderHook(() => useRealtime());

    await act(async () => {
      await result.current.start({
        sessionId: "11111111-1111-1111-1111-111111111111",
        personalityId: "22222222-2222-2222-2222-222222222222",
      });
    });

    // Token fetch hit the BFF.
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/cozy/voice/token",
      expect.objectContaining({ method: "POST" }),
    );

    // After start() resolves, the room was connected and mic was enabled.
    const { Room } = await import("livekit-client");
    const roomInstance = (Room as unknown as Mock).mock.results[0].value as {
      connect: Mock;
      localParticipant: { setMicrophoneEnabled: Mock };
    };
    expect(roomInstance.connect).toHaveBeenCalledWith("wss://lk", "lk-token");
    expect(roomInstance.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);

    // Simulate the Connected event flipping state.
    await act(async () => {
      getListener(roomInstance as unknown as { on: Mock }, "connected")();
    });

    // After mic enable, the hook itself sets state to `active`.
    expect(result.current.state).toEqual({ kind: "active", speaking: false });
  });

  it("start() flips to `error` with LIVEKIT_FAILED when room.connect() throws", async () => {
    const { Room } = await import("livekit-client");
    (Room as unknown as Mock).mockImplementationOnce(() => ({
      connect: vi.fn().mockRejectedValue(new Error("ws-down")),
      disconnect: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
      localParticipant: { setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined) },
    }));

    const { result } = renderHook(() => useRealtime());
    await act(async () => {
      await result.current.start({
        sessionId: "11111111-1111-1111-1111-111111111111",
        personalityId: "22222222-2222-2222-2222-222222222222",
      });
    });

    expect(result.current.state.kind).toBe("error");
    if (result.current.state.kind === "error") {
      expect(result.current.state.code).toBe("LIVEKIT_FAILED");
      expect(result.current.state.canFallback).toBe(true);
    }
  });

  it("setMicEnabled(false) calls localParticipant.setMicrophoneEnabled(false)", async () => {
    const { result } = renderHook(() => useRealtime());

    await act(async () => {
      await result.current.start({
        sessionId: "11111111-1111-1111-1111-111111111111",
        personalityId: "22222222-2222-2222-2222-222222222222",
      });
    });

    const { Room } = await import("livekit-client");
    const roomInstance = (Room as unknown as Mock).mock.results[0].value as {
      localParticipant: { setMicrophoneEnabled: Mock };
    };

    await act(async () => {
      await result.current.setMicEnabled(false);
    });

    expect(roomInstance.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(result.current.state).toEqual({ kind: "active", speaking: false });
  });

  it("TrackSubscribed for audio attaches the track to the hidden <audio> element", async () => {
    const { result } = renderHook(() => useRealtime());

    await act(async () => {
      await result.current.start({
        sessionId: "11111111-1111-1111-1111-111111111111",
        personalityId: "22222222-2222-2222-2222-222222222222",
      });
    });

    const { Room } = await import("livekit-client");
    const roomInstance = (Room as unknown as Mock).mock.results[0].value as {
      on: Mock;
    };

    const audioEl = document.querySelector("audio[data-realtime-audio='true']");
    expect(audioEl).toBeTruthy();

    const fakeAudioTrack = { attach: vi.fn(), detach: vi.fn() };

    await act(async () => {
      getListener(roomInstance, "trackSubscribed")(
        fakeAudioTrack,
        { kind: "audio" },
        { identity: "ai" },
      );
    });

    expect(fakeAudioTrack.attach).toHaveBeenCalledWith(audioEl);

    // Non-audio track should NOT be attached.
    const fakeVideoTrack = { attach: vi.fn() };
    await act(async () => {
      getListener(roomInstance, "trackSubscribed")(
        fakeVideoTrack,
        { kind: "video" },
        { identity: "ai" },
      );
    });
    expect(fakeVideoTrack.attach).not.toHaveBeenCalled();
  });

  it("DataReceived accumulates JSON turns into the captured summary", async () => {
    const { result } = renderHook(() => useRealtime());

    await act(async () => {
      await result.current.start({
        sessionId: "11111111-1111-1111-1111-111111111111",
        personalityId: "22222222-2222-2222-2222-222222222222",
      });
    });

    const { Room } = await import("livekit-client");
    const roomInstance = (Room as unknown as Mock).mock.results[0].value as { on: Mock };

    const payload = (text: string) => new TextEncoder().encode(text);

    await act(async () => {
      getListener(roomInstance, "dataReceived")(
        payload(JSON.stringify({ role: "user", text: "你好", at: "2026-06-18T00:00:00Z" })),
        { identity: "ai" },
      );
    });
    await act(async () => {
      getListener(roomInstance, "dataReceived")(
        payload(JSON.stringify({ role: "assistant", text: "你好！", at: "2026-06-18T00:00:01Z" })),
        { identity: "ai" },
      );
    });
    // Malformed payload must be ignored, not thrown.
    await act(async () => {
      getListener(roomInstance, "dataReceived")(payload("not-json"), { identity: "ai" });
    });

    // (globalThis.fetch as Mock).mockResolvedValueOnce for summary endpoint
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    await act(async () => {
      await result.current.hangup();
    });

    // The most-recent POST is the summary upload.
    const lastCall = (globalThis.fetch as Mock).mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("/api/cozy/voice/summary");
    const sentBody = JSON.parse(lastCall?.[1]?.body as string);
    expect(sentBody.turns).toHaveLength(2);
    expect(sentBody.turns[0]).toMatchObject({ role: "user", text: "你好" });
    expect(sentBody.turns[1]).toMatchObject({ role: "assistant", text: "你好！" });

    expect(result.current.lastSummary?.turns).toHaveLength(2);
    expect(result.current.state).toMatchObject({ kind: "ended" });
  });

  it("hangup() disconnects the room and POSTs the summary", async () => {
    const { result } = renderHook(() => useRealtime());

    await act(async () => {
      await result.current.start({
        sessionId: "11111111-1111-1111-1111-111111111111",
        personalityId: "22222222-2222-2222-2222-222222222222",
      });
    });

    const { Room } = await import("livekit-client");
    const roomInstance = (Room as unknown as Mock).mock.results[0].value as {
      disconnect: Mock;
    };

    await act(async () => {
      await result.current.hangup();
    });

    expect(roomInstance.disconnect).toHaveBeenCalled();

    const summaryCall = (globalThis.fetch as Mock).mock.calls.find(
      (c) => c[0] === "/api/cozy/voice/summary",
    );
    expect(summaryCall).toBeTruthy();
    const body = JSON.parse((summaryCall?.[1] as { body: string }).body);
    expect(body.session_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(body.turns).toEqual([]);
    expect(body.tool_calls).toEqual([]);
  });
});
