# M4 Complete — Advanced Capabilities

**Milestone:** M4 of 8
**Date:** 2026-06-18
**Branch:** `feat/m4-advanced` → `main` (merged with `--no-ff`)
**Plan:** [docs/superpowers/plans/2026-06-25-m4-advanced.md](plans/2026-06-25-m4-advanced.md)

---

## TL;DR

M4 ships the **power-user features** that turn CozyCopilot from a basic chat
app into a full CozyEngineV2 client. After M4 the chat app is feature-complete
from the spec's standpoint for power users. M5-M8 add voice (M5), embed widget
polish (M6), themes (M7), and release polish (M8).

| Metric | Baseline (M3) | After M4 | Delta |
|---|---|---|---|
| Test files | 55 | 71 | **+16** |
| Tests passing | 313 | 428 | **+115** |
| Files added | — | 44 | — |
| Lines added | — | +6,084 | — |
| Routes | 20 | 21 | **+1** (`/api/cozy/upload`) |
| Chat-page components wired | 0 (M1/M2) | **3** (PersonalityPicker, SessionList, ToolCallViewer) | **+3** |

All gates green: `pnpm typecheck` 0 errors, `pnpm lint --max-warnings 0`
0 warnings, `pnpm test` 428/428 pass, `pnpm build:web` succeeds.

---

## What shipped

### M4.1 — WebSocket client (`src/lib/api/ws.ts`)

Pure-TS class, no React, so it works in both Node (vitest) and browser.

- `class WSClient` with `connect(url, token)` / `send(event)` / `on(type, handler)` / `close()`
- Auto-reconnect with exponential backoff: **1s → 2s → 4s → 8s → 16s** (max 5 attempts)
- **Ping/pong heartbeat every 30s** with disconnect detection
- **Test pattern:** tiny in-test `FakeWS` class — no `mock-socket` dependency

**Test coverage:** 9 cases covering connect, send, receive, reconnect backoff
sequence, error handling, heartbeat timeout, multi-handler dispatch.

### M4.2 — Async task hook (`src/features/async/`)

`useAsyncTask(taskId)` — primary path is WebSocket push; falls back to 2s
HTTP polling via BFF `GET /api/cozy/chat/async?taskId=...`.

- Components: `AsyncTaskList.tsx`, `AsyncTaskCard.tsx`
- On completion: fires `useNotify().send({title, body})` for OS notification
- `apiFetch.ts` mirrors providers' pattern: injects `useAuthStore().jwt`,
  unwraps `{ ok, data }` envelopes
- **BFF gap fix (commit 13e63c8):** added `GET /api/cozy/chat/async?taskId=...`
  handler with 9 new tests (auth, missing param, happy path, URL encoding,
  upstream error mapping)

**Test coverage:** 11 hook tests + 9 BFF GET tests = 20 cases.

### M4.3 — File upload (`src/features/upload/` + `app/api/cozy/upload/`)

Drag/drop + file picker → multipart POST to BFF `/api/cozy/upload` → forwards to
CozyEngineV2 `/v1/upload`.

- `UploadDropzone.tsx` — drag/drop + click-to-pick
- `useUpload()` hook — uses **`XMLHttpRequest` (not `fetch`)** because fetch
  doesn't support upload progress events
- `UploadProgress.tsx` — progress bar (0-100%)
- Image preview for `image/*` MIME types
- BFF route: 20MB cap, MIME allowlist (`image/*`, `application/pdf`, text files),
  zod-validated envelope forwarding

**Why XHR for upload progress:** `fetch` returns a Response object but never
exposes the request stream for progress monitoring. XHR's `upload.onprogress`
is the only browser-API path to a live progress bar.

**Test coverage:** 6 hook tests + 8 component tests + 8 BFF route tests = 22 cases.

### M4.4 — ToolCall viewer (`src/features/tools/`)

Purple-strip UI for tool-call events flowing from SSE and WebSocket. **Wired
into `app/(web)/chat/page.tsx`**: every SSE event from `streamChat` is fed
to `useToolCalls`, and the resulting map is rendered below the message list.

- `ToolCallViewer.tsx` — collapsible arguments/result, distinct purple accent
- `useToolCalls()` hook — `Record<string, ToolCallData>` aggregation with
  `ingestSSE(event)`, `ingestWS(event)`, `reset()` methods
- **Chat stream extension:** `ChatStreamEvent` union in `src/lib/api/chat.ts`
  now includes `ChatToolCallEvent` and `ChatToolResultEvent` — these flow
  through the existing `streamChat` async generator
- **Reset behavior:** switching sessions calls `useToolCalls.reset()` so each
  session starts with a fresh turn graph

**Test coverage:** 6 hook tests + 5 component tests = 11 cases.

### M4.5 — Custom LLM provider CRUD (`src/features/providers/`)

Full UI + hook for managing custom OpenAI-compatible providers.

- `ProviderList.tsx` — table of saved providers (no `api_key` ever shown)
- `ProviderForm.tsx` — add/edit form (base_url, api_key, model, label)
- `ProviderTestButton.tsx` — calls `POST /api/cozy/providers/test` (one-shot)
- `useProviders()` hook — `items`, `loading`, `error`, `refresh()`, `create()`,
  `update()`, `remove()`, `test()`
- **Key security:** api_key is sent once via POST, never returned. Subsequent
  GETs return `{id, base_url, model, label, created_at}` only. CozyEngineV2
  handles encryption.

**Test coverage:** 9 hook tests + 4 list tests + 4 form tests + 2 button tests = 19 cases.

### M4.6 — Personality + session management (`src/features/personalities/`, `src/features/sessions/`)

- **`PersonalitiesClient`** mounted in `app/(web)/chat/page.tsx` header
- **`SessionsClient`** mounted in `app/(web)/chat/page.tsx` left sidebar
- **`useSessionStore`** extended with `activeSessionId`, `activePersonalityId`,
  `setActiveSession`, `setActivePersonality`; `clear()` preserves identity
  (only wipes message state)

- **`PersonalityPicker`** — header dropdown with selectable list + inline
  "+ New" form. Model dropdown merges 4 built-in flagships
  (`gpt-4o`, `gpt-4o-mini`, `claude-3.5-sonnet`, `gemini-1.5-pro`) with
  `<provider_id>:<model>` entries from `useProviders()` (option A from the brief).
- **`SessionList`** — sidebar list with create/rename/delete. Hover shows
  rename + delete icons. Active session highlighted. `window.confirm()` for
  delete (polished dialog deferred to M7).
- Both hooks expose full CRUD with loading/error states.

**Test coverage:** 18 personality tests + 22 session tests = 40 cases
(over-delivered vs. ~20 brief estimate because full CRUD round-trips are
covered).

### M4.7 — Integration test (`tests/integration/m4-flow.test.ts`)

**One happy-path test** pinning the BFF boundary across 4 surfaces:

1. **Chat SSE** — mock upstream returns `event: delta` → `event: tool_call`
   → `event: done` over `ReadableStream`; assert raw SSE bytes + event order
2. **Async task** — POST returns pending; GET returns completed
3. **File upload** — hand-rolled multipart body with PNG signature bytes;
   assert upstream receives FormData with `session_id`, `personality_id`, `file`
4. **Provider CRUD** — POST → GET list (api_key absent via JSON.stringify
   substring check) → DELETE

**Test coverage:** 4 integration cases. **Vitest glob picked up the new
folder automatically** — no `vitest.config.ts` change needed.

---

## Files affected

```
# New (44 files)
app/api/cozy/upload/{route,route.test}.ts
src/lib/api/ws.ts, src/lib/api/ws.test.ts
src/features/async/{apiFetch,useAsyncTask,AsyncTaskCard,AsyncTaskList}.{ts,tsx}
src/features/async/*.test.{ts,tsx}
src/features/upload/{useUpload,UploadDropzone,UploadProgress}.{ts,tsx}
src/features/upload/*.test.{ts,tsx}
src/features/tools/{useToolCalls,ToolCallViewer}.{ts,tsx} (+ tests)
src/features/providers/{apiFetch,useProviders,ProvidersClient,
                        ProviderList,ProviderForm,ProviderTestButton}.{ts,tsx}
src/features/providers/*.test.{ts,tsx}
src/features/personalities/{apiFetch,usePersonalities,PersonalityPicker,
                            PersonalitiesClient,index}.{ts,tsx}
src/features/personalities/*.test.{ts,tsx}
src/features/sessions/{apiFetch,useSessions,SessionList,
                       SessionsClient,index}.{ts,tsx}
src/features/sessions/*.test.{ts,tsx}
tests/integration/m4-flow.test.ts
docs/superpowers/plans/2026-06-25-m4-advanced.md

# Modified (6 files)
src/lib/api/chat.ts                              (ChatStreamEvent +tool_call/tool_result)
src/lib/api/errors.ts                            (UPLOAD_ERROR_CODES)
src/stores/session.ts                            (M4.6 active session + personality state)
app/(web)/chat/page.tsx                          (wire picker + session list + ToolCallViewer)
app/(web)/settings/providers/page.tsx            (M4.5 settings page)
app/api/cozy/chat/async/route.ts + .test.ts      (M4.2 BFF GET handler + 9 tests)
```

**Total:** 44 new files, 6 modified, **+6,084 / -18 lines** (modified includes
the chat-page wiring).

---

## Architecture decisions

### 3.1 `src/lib/api/ws.ts` is pure TypeScript

Not a hook — a `class WSClient`. React hooks (`useWebSocket`) wrap it. This
keeps the WebSocket client testable in Node (vitest) without jsdom browser
APIs.

### 3.2 Async-task fallback = HTTP polling, not WebSocket-only

Primary path: WebSocket push (real-time). Fallback: 2s polling via BFF
`GET /api/cozy/chat/async?taskId=...` when WS is disconnected. The fallback
guarantees the user always sees completion, even with flaky network.

### 3.3 Upload BFF route design

`POST /api/cozy/upload` accepts multipart/form-data, forwards to
CozyEngineV2 `/v1/upload` (M4.3.5 stubbed; real upstream documented in
integration contracts). 20MB cap + MIME allowlist enforced server-side so
clients can't bypass.

### 3.4 ToolCall event format

CozyEngineV2 streams `event: tool_call` and `event: tool_result` interleaved
with `event: delta` and `event: done`. The M2 SSE client (`streamChat`) parses
all four — extended via discriminated-union types in `ChatStreamEvent`.

### 3.5 Custom provider `<provider_id>:<model>` encoding

When custom providers exist, the chat request `model` field uses
`<provider_id>:<model>` (e.g. `8a3f...:gpt-4o`). Built-in models keep plain
names. CozyEngineV2 splits on `:` to route. UI composes the dropdown via
`useProviders()` + a hardcoded built-in list — **option A from the brief** —
so BFF contracts stay unchanged.

---

## Dependencies

**No new third-party dependencies added.** Everything is built on:

- `next@15`, `react@19`, `typescript@5.9`, `tailwindcss@4`
- `zustand` (existing) for the auth store
- `zod` (existing) for BFF validation
- `vitest` (existing) for tests
- Node 18+ native APIs: `ReadableStream`, `FormData`, `Blob`

---

## Verification

```bash
$ pnpm typecheck
> tsc --noEmit
(exit 0)

$ pnpm lint --max-warnings 0
> eslint . --max-warnings 0
(exit 0)

$ pnpm test
 Test Files  71 passed (71)
      Tests  428 passed (428)

$ pnpm build:web
... (succeeds, 21 routes)
```

Manual smoke test plan (deferred to next session — Rust toolchain / Xcode not
installed locally):

1. Chat → see ToolCall block appear in real time
2. Send message that triggers deferred task → see notification on completion
3. Drag image to chat → see upload progress → see image preview
4. Add custom OpenAI-compatible provider → test connection → save → use model
5. Create new session → rename → delete → verify CRUD round-trip

---

## Risk register — what went right and what we punted

| Risk | Mitigation taken | Outcome |
|---|---|---|
| WebSocket mock in jsdom is non-trivial | In-test `FakeWS` class | ✅ Worked, no `mock-socket` dep |
| CozyEngineV2 has no real `/v1/upload` | BFF forwards, fixture-based tests | ✅ Stubs in place, real wiring in M5/M8 |
| ToolCall schema drift | Discriminated union types, runtime shape check | ✅ Type-safe at SSE parse boundary |
| Custom-provider key encryption | Documented: BFF forwards raw, CozyEngineV2 encrypts | ✅ Frontend never sees key after POST |
| Integration test flakiness | Fake timers + deterministic fixtures | ✅ 4 cases pass deterministically |
| **`@capacitor/core` side-effect** | Use `isLiveTauri()` guard; defer Capacitor wiring | ⚠️ Documented in M3 closeout |
| **Static-export blocker** | Build scripts fail fast with M6 message | ⚠️ Tracked for M6 |
| **`window.confirm()` UX varies by platform** | Polished dialog deferred to M7 | ⚠️ Tracked |
| **Built-in model list hardcoded** | Easy to swap for config in M7 | ⚠️ Tracked |

---

## What's next (M5)

**Voice features:** TTS (text-to-speech), STT (speech-to-text) via
LiveKit. M3 already shipped the `voice` BFF route and `MicPermissionPrompt`
component (M3.4); M5 wires them into the chat UI.

Key files for M5:
- `app/api/cozy/voice/token/route.ts` (exists)
- `src/features/voice/MicPermissionPrompt.tsx` (exists)
- New: TTS playback hook, LiveKit room connector, voice-mode toggle in chat header

Plan doc: `docs/superpowers/plans/2026-06-XX-m5-voice.md` (to be drafted
after M4 merge).

---

## References

- M4 plan: [docs/superpowers/plans/2026-06-25-m4-advanced.md](plans/2026-06-25-m4-advanced.md)
- M2 BFF contracts: `app/api/cozy/{chat/async,sessions,providers}/`
- M3 platform abstractions: `src/lib/{capabilities,notifications,storage}/`
- M1 stream client: `src/lib/api/chat.ts`
- M0 design: `docs/superpowers/specs/2026-06-10-cozycopilot-design.md` §5 (modules), §6.1-6.2 (data flows)

---

**M4 is complete. Ready to merge to main.**
