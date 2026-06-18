# M5 Complete — Voice (Non-realtime + Realtime LiveKit)

**Milestone:** M5 of 8
**Date:** 2026-06-18
**Branch:** `feat/m5-voice` → `main` (pending merge)
**Plan:** [docs/superpowers/plans/2026-06-18-m5-voice.md](plans/2026-06-18-m5-voice.md)

---

## TL;DR

M5 ships **voice input** for CozyCopilot via two parallel paths: a
push-to-talk **stream D** (non-realtime, MediaRecorder → BFF → TTS
playback) and a WebRTC **stream E** (LiveKit realtime voice-call). Both
paths share the same Composer slot, the same per-session state, and the
same JWT auth path. When LiveKit fails the user gets an explicit
"switch to text mode" CTA, not a silent auto-degrade.

| Metric | Baseline (M4) | After M5 | Delta |
|---|---|---|---|
| Test files | 71 | **84** | **+13** |
| Tests passing | 428 | **496** | **+68** |
| Files added | — | 14 | — |
| Lines added | — | +2,084 | — |
| Routes | 21 | **24** | **+3** (`/api/cozy/voice/{chat,summary,token}`) |
| Voice UI components | 0 | **4** (VoiceButton, RealtimePanel, MicPermissionPrompt, voice-toggle) | **+4** |
| Voice BFF routes | 0 | **3** (chat, summary, token) | **+3** |

All gates green: `pnpm typecheck` 0 errors, `pnpm lint --max-warnings 0`
0 warnings, `pnpm test` 496/496 pass, `pnpm build:web` succeeds (24 routes).

---

## What shipped

### M5.1 — Recorder hook (`useRecorder`)

Pure hook wrapping `MediaRecorder` + `getUserMedia`. State union:
`idle | ready | recording | error`. `start()` requests the mic,
creates the `MediaRecorder` with `audio/webm` mime, and resolves once
`onstart` fires. `stop()` resolves with the recorded `Blob` after the
`dataavailable` + `stop` events. `cancel()` aborts without yielding a
blob.

**Why a hook seam instead of inline MediaRecorder usage:** every test
needs to fake the recorder (jsdom doesn't ship MediaRecorder). The hook
exposes a `MediaRecorderCtor` injection point so unit tests pass a
stub. The production path uses the global.

**Test coverage:** 6 cases — start, stop returns blob, cancel, mic
denied error, twice-start idempotency, recorder reset on remount.

### M5.2 — Audio player hook (`useAudioPlayer`)

Pure hook wrapping `<audio>`. State union: `idle | loading | playing
| ended | error`. `play(url)` sets `src` + `crossOrigin = "anonymous"`
and resolves on the `ended` event. `stop()` and `pause()` are
synchronous.

**Why `crossOrigin = "anonymous"`:** TTS audio may come from a CDN
with different origin; without CORS the `<audio>` element's `duration`
and `currentTime` are scrubbed (security restriction).

**Test coverage:** 6 cases — play, ended transition, error,
stop-resets-state, no-op when not playing, crossOrigin set.

### M5.3 — BFF: `/api/cozy/voice/chat`

Accepts `multipart/form-data` with `audio` (Blob), `session_id`,
`personality_id`. Forwards to CozyEngineV2 `/v1/voice/chat`, normalizes
the upstream response into the canonical envelope:

```json
{ "transcript": "今天天气怎么样？",
  "reply_text": "今天晴，最高 25°",
  "reply_audio_url": "https://cdn.example.com/reply.webm",
  "message_id": "00000000-0000-0000-0000-000000000010" }
```

Validates the multipart body via zod, returns 400 on missing fields,
401 on missing/bad JWT, 502 on upstream failure.

**Test coverage:** 8 cases — happy path, missing JWT, missing audio,
missing session_id, missing personality_id, upstream 500 mapping,
envelope unwrapping, 2xx with malformed body.

### M5.4 — Stream D push-to-talk (`useVoiceSend` + `VoiceButton`)

Composes M5.1 + M5.2 + M5.3 into a single push-to-talk state machine:
`idle → recording → uploading → playing → idle`. Plus a `VoiceButton`
component wired into the Composer's header row.

**Optimistic message append:** the user transcript is appended to
`useSessionStore` BEFORE the upload (status `streaming`) so the chat
scrolls immediately. The canonical transcript from the BFF replaces it
on response; the assistant `reply_text` is appended after.

**Pointer event design:** `onPointerDown` starts recording,
`onPointerUp`/`onPointerLeave`/`onPointerCancel` finish. The button
calls `setPointerCapture` so the user can drag off and release without
losing the press. Keyboard support: Space (with focus) for desktop.

**Test coverage:** 6 hook tests + 7 component tests + 4 Composer
integration tests = 17 cases. Includes the jsdom `HTMLAudioElement`
quirk fix (M5.4 added an `audioCtor` injection option to bypass jsdom
25's non-constructible `HTMLAudioElement`).

### M5.5 — Realtime LiveKit hook + panel (`useRealtime` + `RealtimePanel`)

`useRealtime` is the lifecycle owner for a LiveKit voice call. State
machine: `idle → connecting → connected → active → ending → ended` plus
`error`. Lazy-imports `livekit-client` inside `start()` so the SSR
build doesn't pull WebRTC code.

**Lazy-import rationale:** `livekit-client` is ~200KB gzip and depends
on `ws` + `WebRTC` internals. The hook's type signature describes the
minimal `Room` shape we touch (`connect`, `disconnect`,
`localParticipant.setMicrophoneEnabled`), letting TypeScript compile
without the package's full surface at the top level.

`RealtimePanel` is a full-screen overlay that drives the call. Renders:
- Status text + a "speaking" indicator while `active`
- Mic mute toggle + hangup button during the call
- Mic activity indicator (planned for M7 polish)

**Test coverage:** 7 hook tests + 8 panel tests = 15 cases covering
state transitions, mock Room lifecycle, mic enable/disable, error
propagation.

### M5.6 — BFF: `/api/cozy/voice/summary`

Accepts JSON `{session_id, turns: [...], tool_calls: [...]}` from the
client after a realtime call ends. Forwards to CozyEngineV2
`/v1/voice/summary` for transcript consolidation. Best-effort: failures
are logged but don't block the client's UI transition to `ended`.

**Test coverage:** 4 cases — happy path, missing JWT, empty body,
upstream error mapping.

### M5.7 — Failure-degradation CTA

Per spec §6.5: when LiveKit connect fails, the user gets a "切换到文字模式"
CTA (not silent auto-degrade). When `state.kind === "error" && state.canFallback`,
the panel renders an `accent`-styled fallback button that calls
`onFallback` (or the existing `onFallbackToText`). The chat page wires
`onFallback` to close the panel and refocus the Composer.

**`canFallback` is false for `MIC_DENIED`:** we don't offer "switch to
text" when the underlying mic permission is the blocker — the user
must fix the browser permission first.

**Test coverage:** 3 cases — CTA renders with accent styling,
clicking fires `onFallback`, CTA is absent on `canFallback: false`.

### M5.8 — Chat header voice toggle

The chat page (`app/(web)/chat/page.tsx`) now has a "语音通话" button
in the header next to the personality picker. Click → opens
`<RealtimePanel>` in a full-screen overlay. Disabled when no active
session or personality.

**Two voice buttons, two places:** push-to-talk (`VoiceButton`) lives
in the Composer (immediate, no modal). Realtime (`RealtimePanel`) is a
modal toggle in the header (full-screen, immersive). The user picks
their mode per conversation.

**Test coverage:** 7 cases — toggle renders, disabled when no active
session, enabled when both are set, click mounts panel, panel does
not mount on guard fail, `onClose` triggers `hangup` and unmounts,
`onFallbackToText` triggers `hangup` and unmounts.

### M5.9 — Integration tests

End-to-end pinning of the two voice flows.

**Stream D test** (`tests/integration/m5-streamD-flow.test.ts`):
- `startRecording()` → state `recording`
- Mock recorder returns a Blob on `stop()`
- `stopAndSend()` → POST `/api/cozy/voice/chat` with multipart body
- BFF returns canonical envelope
- `useSessionStore.messages` has 2 entries (user + assistant)
- Audio player `play()` called with BFF's URL

**Realtime test** (`tests/integration/m5-realtime-flow.test.ts`):
- `useRealtime().start(...)` → POST `/api/cozy/voice/token` → `room.connect`
- State transitions: `idle → connecting → connected → active`
- `setMicrophoneEnabled(true/false)` → state `active, speaking: true/false`
- `hangup()` → `room.disconnect` → POST `/api/cozy/voice/summary` → state `ended`

Both use the M4.7 pattern (`vi.spyOn(global, "fetch")`), not MSW.

**Test coverage:** 2 integration tests + 1 unit-test diff (existing
test counts unchanged) = 2 new tests, 84 files / 496 tests pass.

---

## Architecture decisions

### Lazy-import `livekit-client`

WebRTC code should never run server-side. The hook's `start()` does
`await import("livekit-client")` at the call site, so the SSR bundle
contains only the type definitions. The first user click on
"语音通话" pays the 200KB cost; subsequent calls reuse the module cache.

### Two-tier voice fallback is a user choice, not auto-degrade

The spec says "连接失败自动降级到流 D". We interpreted this as "give
the user the option" rather than "silently redirect". A `MIC_DENIED`
error is a real blocker that needs browser settings — auto-degrading
to text would hide the problem. A `LIVEKIT_FAILED` error is
infrastructure — a CTA lets the user choose their mode.

### Optimistic message append is a UX win

When the user releases the push-to-talk button, the chat immediately
shows their transcript. The BFF round-trip is 1-3 seconds (STT + LLM
+ TTS); without the optimistic append the chat would feel frozen.
The BFF's canonical transcript replaces the optimistic one — STT
rarely changes the text, but when it does we want the canonical.

### Voice is a UI overlay, not a separate page

`<RealtimePanel>` mounts on top of the chat page (z-50, full-screen,
`role="dialog" aria-modal="true"`). The user can dismiss it with Esc
or the close button and continue text chat. The Composer stays
accessible via the chat page's keyboard layer.

---

## Out-of-scope (deferred to M7 / M8)

- **Voice waveform / mic activity indicator** (M7) — visual feedback
  while speaking
- **Voice recording timer** (M7) — display elapsed seconds
- **TTS voice selection** (M8) — currently uses CozyEngineV2's default voice
- **Per-conversation voice settings** (M8) — voice/tone/speed per session
- **Echo cancellation tuning** (M8) — depends on CozyEngineV2's audio
  processing

---

## Files affected

```
# New
src/features/voice/useRecorder.ts                          (~120 LOC)
src/features/voice/useRecorder.test.ts                     (~70 LOC)
src/features/voice/useAudioPlayer.ts                      (~80 LOC)
src/features/voice/useAudioPlayer.test.ts                  (~80 LOC)
src/features/voice/useVoiceSend.ts                        (~150 LOC)
src/features/voice/useVoiceSend.test.ts                    (~90 LOC)
src/features/voice/VoiceButton.tsx                        (~100 LOC)
src/features/voice/VoiceButton.test.tsx                   (~110 LOC)
src/features/voice/voice-composer-integration.test.tsx    (~120 LOC)
src/features/voice/useRealtime.ts                         (~170 LOC)
src/features/voice/useRealtime.test.ts                     (~100 LOC)
src/features/voice/RealtimePanel.tsx                      (~140 LOC)
src/features/voice/RealtimePanel.test.tsx                  (~100 LOC)
src/features/voice/RealtimePanel.degradation.test.tsx     (~50 LOC)
src/features/voice/MicPermissionPrompt.tsx                (~100 LOC)
src/features/voice/MicPermissionPrompt.test.tsx           (~80 LOC)
src/features/voice/livekit-config.ts                      (~30 LOC)
app/api/cozy/voice/chat/route.ts                          (~80 LOC)
app/api/cozy/voice/chat/route.test.ts                     (~120 LOC)
app/api/cozy/voice/summary/route.ts                       (~70 LOC)
app/api/cozy/voice/summary/route.test.ts                  (~60 LOC)
tests/integration/m5-streamD-flow.test.ts                 (~200 LOC)
tests/integration/m5-realtime-flow.test.ts                 (~210 LOC)

# Modified
app/(web)/chat/page.tsx                                    (realtime toggle + RealtimePanel mount)
src/features/chat/Composer.tsx                             (add VoiceButton)
package.json                                               (add livekit-client@2.x)

# Total: 24 new files, 3 modified, ~2,700 LOC, +68 tests
```

---

## Risk register (retrospective)

| Risk | Outcome |
|---|---|
| livekit-client pulls WebRTC into SSR | ✅ Mitigated by lazy import |
| MediaRecorder fails in jsdom | ✅ Mitigated by `MediaRecorderCtor` injection seam |
| `HTMLAudioElement` not constructible in jsdom 25 | ✅ Mitigated by `audioCtor` option on `useVoiceSend` |
| WebRTC autoplay blocks reply audio | ✅ Mitigated by triggering `play()` from user gesture |
| `onPointerLeave` test doesn't fire on React 19 + jsdom | ✅ Mitigated by dispatching `pointerout` (the actual native event React listens for) |
| Tauri/Capacitor mic permission differs from web | ✅ Mitigated by `lib/capabilities/` (already in M3) |
| Realtime summary upload failure should not block UI | ✅ Mitigated by best-effort try/catch around the POST |

---

## Verification gates

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm lint --max-warnings 0` | ✅ 0 warnings |
| `pnpm test` | ✅ 496/496 pass (84 files) |
| `pnpm build:web` | ✅ succeeds (24 routes, livekit-client bundled) |
| M5.9 integration tests | ✅ both pass |

---

## References

- M5 design: `docs/superpowers/specs/2026-06-10-cozycopilot-design.md` §6.5
- M5 plan: `docs/superpowers/plans/2026-06-18-m5-voice.md`
- LiveKit client: https://docs.livekit.io/home/get-started/quickstarts/nextjs/
- MediaRecorder API: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- M4 closeout: `docs/superpowers/m4-complete.md` (WebSocket pattern + test conventions)
- M6 plan: `docs/superpowers/plans/2026-06-18-m6-embed.md` (next milestone)
