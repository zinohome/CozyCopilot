// M5.9 — Stream E (realtime, LiveKit) end-to-end integration test.
//
// Wires the M5.5 `useRealtime` hook through its full state machine:
//   1. start({sessionId, personalityId})
//      - POST /api/cozy/voice/token → {token, url}
//      - new Room(); attach listeners
//      - room.connect(url, token) → RoomEvent.Connected
//      - setMicrophoneEnabled(true)
//      - state: idle → connecting → connected → active
//   2. setMicEnabled(false) → state.active.speaking flips to false
//   3. hangup()
//      - room.disconnect() → RoomEvent.Disconnected
//      - POST /api/cozy/voice/summary with captured turns/tool_calls
//      - state: active → ending → ended
//
// livekit-client is mocked via `vi.mock` (top-level) so we don't pull the
// browser-only bundle into jsdom. The BFF↔CozyEngineV2 boundary is mocked
// with `vi.spyOn(global, "fetch")` (M4.7 pattern — no MSW).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  // The fake Room keeps its own listener registry so we can replay events
  // on demand. Each `connect()` synchronously fires the Connected event
  // before resolving; each `disconnect()` synchronously fires Disconnected.
  function makeFakeRoom() {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const fakeRoom = {
      connect: vi.fn(async () => {
        const fns = listeners.get(RoomEvent.Connected) ?? [];
        for (const fn of fns) fn();
      }),
      disconnect: vi.fn(async () => {
        const fns = listeners.get(RoomEvent.Disconnected) ?? [];
        for (const fn of fns) fn();
      }),
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        const existing = listeners.get(event) ?? [];
        existing.push(fn);
        listeners.set(event, existing);
      }),
      off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        const existing = listeners.get(event) ?? [];
        listeners.set(
          event,
          existing.filter((f) => f !== fn),
        );
      }),
      localParticipant: {
        setMicrophoneEnabled: vi.fn(async () => undefined),
      },
    };
    return fakeRoom;
  }
  const Room = vi.fn(makeFakeRoom);
  return { Room, RoomEvent };
});

import { act, renderHook } from "@testing-library/react";
import { useRealtime, type RealtimeSummary } from "@/features/voice/useRealtime";
import { useAuthStore } from "@/stores/auth";

const SESSION_ID = "00000000-0000-0000-0000-000000000001";
const PERSONALITY_ID = "00000000-0000-0000-0000-000000000002";
const JWT = "test-jwt";
const LIVEKIT_URL = "wss://livekit.example.com";
const LIVEKIT_TOKEN = "lk-token-abc";

describe("M5 stream E end-to-end realtime", () => {
  let originalFetch: typeof global.fetch;
  let fetchSpy: import("vitest").MockInstance;

  beforeEach(() => {
    originalFetch = global.fetch;
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

  it("start → active → setMicEnabled(false) → hangup → ended with summary upload", async () => {
    // Route token fetch → canonical envelope; route summary fetch → 200.
    fetchSpy = vi.spyOn(global, "fetch").mockImplementation(
      (async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (url === "/api/cozy/voice/token" && method === "POST") {
          return new Response(
            JSON.stringify({
              ok: true,
              data: { token: LIVEKIT_TOKEN, url: LIVEKIT_URL },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url === "/api/cozy/voice/summary" && method === "POST") {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }) as unknown as typeof fetch,
    );

    const { result } = renderHook(() => useRealtime());
    expect(result.current.state).toEqual({ kind: "idle" });

    // 1. start() — fetch token → new Room → connect → setMicEnabled → active.
    await act(async () => {
      await result.current.start({ sessionId: SESSION_ID, personalityId: PERSONALITY_ID });
    });

    // Token BFF was called once with the right shape.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0] as [unknown, RequestInit];
    expect(String(tokenUrl)).toBe("/api/cozy/voice/token");
    expect(tokenInit.method).toBe("POST");
    expect((tokenInit.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${JWT}`,
    );
    const tokenBody = JSON.parse(tokenInit.body as string);
    expect(tokenBody).toEqual({
      session_id: SESSION_ID,
      personality_id: PERSONALITY_ID,
    });

    // Room was constructed and connect() was called with the BFF's url+token.
    const { Room } = await import("livekit-client");
    expect(Room).toHaveBeenCalledTimes(1);
    const roomInstance = (Room as unknown as { mock: { results: Array<{ value: unknown }> } })
      .mock.results[0]!.value as {
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      localParticipant: { setMicrophoneEnabled: ReturnType<typeof vi.fn> };
      on: ReturnType<typeof vi.fn>;
    };
    expect(roomInstance.connect).toHaveBeenCalledWith(LIVEKIT_URL, LIVEKIT_TOKEN);
    expect(roomInstance.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);

    // After start() resolves: state is `active` (Connected listener fired
    // synchronously inside our fake `connect()`, transitioning connecting
    // → connected, then setMicrophoneEnabled resolved and the hook
    // setState({ kind: "active", speaking: false })).
    expect(result.current.state).toEqual({ kind: "active", speaking: false });

    // 2. setMicEnabled(false) — flips the speaking flag.
    await act(async () => {
      await result.current.setMicEnabled(false);
    });
    expect(roomInstance.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(result.current.state).toEqual({ kind: "active", speaking: false });

    // 3. hangup() — disconnect (which fires Disconnected in our fake),
    // summary upload, state `ended`.
    await act(async () => {
      await result.current.hangup();
    });

    expect(roomInstance.disconnect).toHaveBeenCalledTimes(1);

    // fetch was called twice total: once for token, once for summary.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [summaryUrl, summaryInit] = fetchSpy.mock.calls[1] as [unknown, RequestInit];
    expect(String(summaryUrl)).toBe("/api/cozy/voice/summary");
    expect(summaryInit.method).toBe("POST");
    expect((summaryInit.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${JWT}`,
    );
    const summaryBody = JSON.parse(summaryInit.body as string) as RealtimeSummary;
    expect(summaryBody.session_id).toBe(SESSION_ID);
    expect(summaryBody.turns).toEqual([]);
    expect(summaryBody.tool_calls).toEqual([]);

    expect(result.current.state.kind).toBe("ended");
    expect(result.current.lastSummary).not.toBeNull();
    expect(result.current.lastSummary?.session_id).toBe(SESSION_ID);
  });
});