# M2 — BFF Coverage, Error Normalization, Contract Tests

**Milestone:** M2 of 8
**Date:** 2026-06-15
**Branch:** `feat/m2-bff-coverage`
**Status:** Planned

---

## 0. Goal

M1 shipped 2 of 16 BFF routes (`auth`, `chat`). M2 closes the BFF coverage gap: **all 14 remaining routes + WebSocket** are in place, all errors flow through a single `ApiError → ErrorCode` normalizer with the spec's 20 codes, all routes are exercised by **contract tests** that pin the BFF↔CozyEngineV2 wire format, and a **rate-limit middleware** protects against the BFF being abused.

After M2 the BFF is feature-complete from the CozyEngineV2 spec's standpoint; M3–M6 are pure-frontend work.

---

## 1. Scope (in / out)

### In

- 12 remaining BFF routes (chat/voice-token is the 13th; counted with chat group)
  - `POST /api/cozy/chat/async`
  - `POST /api/cozy/chat/voice`
  - `POST /api/cozy/chat/voice-token`
  - `POST /api/cozy/chat/voice-summary`
  - `POST /api/cozy/chat/voice-context`
  - `GET/POST /api/cozy/sessions`
  - `GET/PATCH/DELETE /api/cozy/sessions/[id]`
  - `GET/POST /api/cozy/personalities`
  - `GET/POST /api/cozy/providers`
  - `GET/PATCH/DELETE /api/cozy/providers/[id]`
  - `POST /api/cozy/providers/test`
  - `GET /api/cozy/memory/preview`
  - `DELETE /api/cozy/memory/[id]`
  - `POST /api/cozy/voice/token`
- `WebSocket /api/ws/chat` (proxy)
- `ErrorCode` union + `normalize()` helper (`src/lib/api/errors.ts`)
- BFF error-envelope helper (`src/lib/api/bff.ts`) — removes repeated boilerplate from `auth` + `chat` and makes the new routes 5-line files
- SSE `event: error` normalization in `streamChat` client (`STREAM_INTERRUPTED` + `code` extraction)
- In-memory **rate-limit middleware** (per-IP sliding window, default 60/min, login 5/min)
- Contract test suite (`tests/contract/`) with recorded CozyEngineV2 JSON fixtures

### Out (deferred to later milestones)

- `/api/ws/chat` actual reconnection logic on the client (M4)
- TTS / STT upload multipart (M5)
- Real `livekit-client` integration (M5)
- File upload route (M4 — async task submission is the only M2 piece)
- Frontend feature modules that call these routes (M4 / M5 / M7)
- Persistent rate-limit store (Redis etc.) — v1.0 uses in-memory only; acceptable for single-instance
- Sentry integration (M8)

---

## 2. Architecture

### 2.1 BFF error envelope (existing, now centralized)

All BFF responses use the same shape, defined in spec §7.1:

```typescript
type ApiSuccess<T> = { ok: true; data: T }
type ApiError = {
  ok: false;
  error: {
    code: ErrorCode;          // see §2.2
    message: string;          // internal log
    userMessage: string;      // shown to user
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}
```

`src/lib/api/bff.ts` will export:

```typescript
export function errorResponse(opts: {
  code: ErrorCode;
  message: string;
  status: number;
  details?: Record<string, unknown>;
}): Response
export function errorResponseFromUpstream(
  upstream: Response,
  body: unknown,
): Response
export function unauthorizedResponse(): Response
export function validationResponse(zodError: z.ZodError): Response
export function passThroughSSE(upstream: Response): Response
```

Each new BFF route then reads:

```typescript
export async function POST(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();
  const body = await req.json().catch(() => null);
  const parsed = SomeSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);
  // ...
}
```

### 2.2 ErrorCode union (20 codes from spec §7.2)

```typescript
export type ErrorCode =
  | "NETWORK_OFFLINE" | "TIMEOUT" | "ABORTED"
  | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND"
  | "RATE_LIMITED" | "PROVIDER_QUOTA_EXCEEDED" | "PROVIDER_UNAVAILABLE"
  | "PERSONALITY_NOT_FOUND" | "SESSION_CLOSED" | "VALIDATION_ERROR"
  | "INSUFFICIENT_BALANCE" | "PROVIDER_IN_USE"
  | "STREAM_INTERRUPTED" | "WS_DISCONNECTED"
  | "MIC_DENIED" | "MIC_UNSUPPORTED" | "LIVEKIT_FAILED"
  | "UNKNOWN";

export const ERROR_CODES: Record<ErrorCode, {
  status: number;
  userMessage: string;
  retryable: boolean;
}>;
```

`normalize()` maps `(httpStatus: number, body: any) → ErrorCode`:

- HTTP 0 (network) → `NETWORK_OFFLINE`
- HTTP 401 → `UNAUTHORIZED`
- HTTP 403 → `FORBIDDEN`
- HTTP 404 → `NOT_FOUND` (unless body says `PERSONALITY_NOT_FOUND`)
- HTTP 409 → `PROVIDER_IN_USE`
- HTTP 422 → `VALIDATION_ERROR`
- HTTP 429 → `RATE_LIMITED`
- HTTP 402 → `INSUFFICIENT_BALANCE`
- HTTP 502/503 → `PROVIDER_QUOTA_EXCEEDED` (if body says so) else `PROVIDER_UNAVAILABLE`
- HTTP 400 with body `code: SESSION_CLOSED` → `SESSION_CLOSED`
- else → `UNKNOWN`

The CozyEngineV2 error body is `{ code: ErrorCode, ... }`; we trust its `code` field when present and only fall through to status-based mapping when missing.

### 2.3 SSE error events

CozyEngineV2 may emit `event: error\ndata: {"code": "...", "message": "..."}` mid-stream (per spec §7.4). The current `streamChat` parser in `src/lib/api/chat.ts` only handles `event: message` deltas. M2 extends the parser to:

1. When `event: error` is seen, capture the parsed JSON `{code, message}` and throw `new ApiError(code, message, isRetryable(code))` from the async iterator's `throw()`.
2. When the underlying fetch ReadableStream errors mid-stream, throw `new ApiError("STREAM_INTERRUPTED", ..., true)`.

The session store's `streaming → error` transition (M1.3) already handles thrown errors, so the upstream is ready.

### 2.4 Rate-limit middleware

`middleware.ts` at repo root (Next.js convention). In-memory `Map<key, number[]>` keyed by `${ip}:${routeKey}`. Sliding 60s window. Cleanup of stale entries runs on each request (lazy GC).

Limits (overridable via env):

| Route key | Default | Env var |
|---|---|---|
| `default` | 60 req/min/IP | `RATE_LIMIT_DEFAULT` |
| `auth.login` | 5 req/min/IP | `RATE_LIMIT_LOGIN` |

Response on limit: 429 with `RATE_LIMITED` envelope and `Retry-After: <seconds>` header.

### 2.5 WebSocket proxy

`app/api/ws/chat/route.ts` is a thin WebSocket-relay. In Next.js 15 this is done via `WebSocketPair` inside a route handler (Node runtime only, not edge). It:

1. Authenticates via `?token=<jwt>` query param.
2. Opens a WebSocket to `${COZY_ENGINE_URL}/v1/ws/chat?token=<jwt>`.
3. Pipes messages both directions; closes both sides on error.

**Note:** the *client-side* reconnection logic with exponential backoff is M4 work. M2 ships the proxy so contract tests can hit it.

---

## 3. File layout

```
CozyCopilot/
├─ app/api/cozy/
│  ├─ auth/route.ts                   # M1, refactored to use bff.ts
│  ├─ chat/route.ts                   # M1, refactored to use bff.ts
│  ├─ chat/
│  │  ├─ async/route.ts               # M2.3
│  │  ├─ voice/route.ts               # M2.5  (multipart audio)
│  │  ├─ voice-token/route.ts         # M2.3
│  │  ├─ voice-summary/route.ts       # M2.5
│  │  └─ voice-context/route.ts       # M2.5
│  ├─ sessions/
│  │  ├─ route.ts                     # M2.3  (GET list, POST create)
│  │  └─ [id]/route.ts                # M2.3  (GET, PATCH, DELETE)
│  ├─ personalities/route.ts          # M2.4
│  ├─ providers/
│  │  ├─ route.ts                     # M2.4
│  │  ├─ [id]/route.ts                # M2.4
│  │  └─ test/route.ts                # M2.4
│  ├─ memory/
│  │  ├─ preview/route.ts             # M2.5
│  │  └─ [id]/route.ts                # M2.5
│  └─ voice/token/route.ts            # M2.5
├─ app/api/ws/chat/route.ts           # M2.6
├─ middleware.ts                       # M2.7
├─ src/lib/api/
│  ├─ client.ts                       # M1
│  ├─ chat.ts                         # M1 → M2.6 (SSE error events)
│  ├─ errors.ts                       # M1 → M2.2 (ErrorCode union + normalize)
│  └─ bff.ts                          # M2.1 (BFF-side helpers)
├─ tests/contract/
│  ├─ _setup.ts                       # MSW + fixture loader
│  ├─ fixtures/
│  │  ├─ auth.login.json
│  │  ├─ chat.completions.sse.json
│  │  ├─ chat.async.json
│  │  ├─ sessions.list.json
│  │  ├─ sessions.get.json
│  │  ├─ personalities.list.json
│  │  ├─ providers.list.json
│  │  ├─ providers.create.json
│  │  ├─ providers.test.ok.json
│  │  ├─ providers.test.fail.json
│  │  ├─ providers.delete.in_use.json
│  │  ├─ memory.preview.json
│  │  ├─ voice.token.json
│  │  ├─ voice.chat.json
│  │  ├─ voice.summary.json
│  │  └─ voice.context.json
│  └─ *.contract.test.ts               # one per route group
└─ docs/superpowers/m2-complete.md     # M2 final doc
```

Total: ~30 new files (12 BFF routes × {route.ts, route.test.ts} = 24, + 4 bff.ts, errors.ts updates, chat.ts update, middleware.ts, ws route, contract tests).

---

## 4. Task breakdown (TDD-first)

### M2.0 — M1 final cleanup carryover check
- [ ] Verify all M1.5 gates still green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build:web && pnpm build:embed`
- [ ] Confirm no uncommitted changes in main worktree

### M2.1 — Extract BFF error envelope helper

**Files:** `src/lib/api/bff.ts` (new), `app/api/cozy/auth/route.ts` (refactor), `app/api/cozy/chat/route.ts` (refactor)

**TDD steps:**

1. Write `bff.test.ts`:
   - `errorResponse({code: "UNAUTHORIZED", message: "x", status: 401})` returns Response with status 401, body `{ok:false, error:{code:"UNAUTHORIZED", message:"x", userMessage:"请重新登录", retryable:false}}`
   - `unauthorizedResponse()` returns 401
   - `validationResponse(zodError)` returns 400 with `VALIDATION_ERROR` and field details
   - `errorResponseFromUpstream(res, body)` — for each upstream status code, returns the correct mapped envelope
   - `passThroughSSE(res)` returns 200 SSE passthrough with correct headers
2. Implement `bff.ts`.
3. Refactor existing `auth/route.ts` and `chat/route.ts` to use helpers — no behavior change.
4. Re-run all M1 tests to confirm zero regression.

**Acceptance:**
- `pnpm test` shows bff tests passing
- Existing 22 M1 tests still pass
- Each of auth + chat route files shrinks by ~50% LOC

### M2.2 — Add `ErrorCode` union + `normalize()`

**Files:** `src/lib/api/errors.ts` (extend)

**TDD steps:**

1. Add `ErrorCode` union (20 codes).
2. Add `ERROR_CODES` metadata map with status + userMessage + retryable for each.
3. Add `normalize(status: number, body: any): { code: ErrorCode; message: string; userMessage: string; retryable: boolean }`:
   - If body has `.code` and it matches an `ErrorCode`, use that code's metadata
   - Else fall through to status-based mapping (0 → NETWORK_OFFLINE, 401 → UNAUTHORIZED, etc.)
   - `message` always comes from `body.message` or `HTTP {status}`
4. Tests:
   - All 20 codes resolve to correct metadata
   - `normalize(401, {})` → `UNAUTHORIZED`
   - `normalize(0, {})` → `NETWORK_OFFLINE`
   - `normalize(429, {})` → `RATE_LIMITED` with retryable=true
   - `normalize(404, {code: "PERSONALITY_NOT_FOUND"})` → uses body's code
   - `normalize(500, {})` → `UNKNOWN` with retryable=true
   - `normalize(200, {})` → `UNKNOWN` with retryable=false (defensive)

**Acceptance:**
- `pnpm test src/lib/api/errors.test.ts` passes (new file)
- `ApiError` constructor still works (backward compat)

### M2.3 — Implement 4 BFF routes: chat/async, chat/voice-token, sessions, sessions/[id]

**Files:** `app/api/cozy/chat/async/route.ts`, `app/api/cozy/chat/voice-token/route.ts`, `app/api/cozy/sessions/route.ts`, `app/api/cozy/sessions/[id]/route.ts` + tests

**Schemas (zod):**

```typescript
// chat/async — same shape as chat, but response is JSON not SSE
const AsyncRequestSchema = z.object({
  session_id: z.string().uuid(),
  personality_id: z.string().uuid(),
  message: z.string().min(1).max(10000),
  model: z.string().optional(),
});
// Response: { ok: true, data: { task_id: string, status: "pending" } }

// chat/voice-token — request LiveKit JWT for Realtime
const VoiceTokenRequestSchema = z.object({
  session_id: z.string().uuid(),
  personality_id: z.string().uuid(),
});
// Response: { ok: true, data: { token: string, url: string, room: string } }

// sessions POST — create
const CreateSessionSchema = z.object({
  personality_id: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
});
// Response: { ok: true, data: Session }

// sessions/[id] PATCH
const UpdateSessionSchema = z.object({
  title: z.string().max(200).optional(),
  personality_id: z.string().uuid().optional(),
}).refine(o => o.title !== undefined || o.personality_id !== undefined, "empty patch");
```

**TDD steps per route:**

1. Write `route.test.ts` covering:
   - Missing JWT → 401
   - Invalid JSON body → 400 VALIDATION_ERROR
   - Schema violation (e.g. `session_id: "not-a-uuid"`) → 400 VALIDATION_ERROR with field path
   - Upstream 200 → forwards `{ok:true, data: ...}` shape
   - Upstream 4xx → mapped ErrorCode envelope with same status
   - Upstream 5xx → 502 with `PROVIDER_UNAVAILABLE`
2. Implement route using `bff.ts` helpers.
3. Re-run contract tests after the route is done.

**Acceptance:**
- 4 new route files + 4 new test files
- `pnpm test app/api/cozy/chat/async` etc. all pass

### M2.4 — Implement 4 BFF routes: personalities, providers, providers/[id], providers/test

**Files:** `app/api/cozy/personalities/route.ts`, `app/api/cozy/providers/route.ts`, `app/api/cozy/providers/[id]/route.ts`, `app/api/cozy/providers/test/route.ts` + tests

**Schemas:**

```typescript
// providers POST
const CreateProviderSchema = z.object({
  label: z.string().min(1).max(100),
  base_url: z.string().url(),
  api_key: z.string().min(1),
  model: z.string().min(1).max(100),
  is_default: z.boolean().optional(),
});

// providers/[id] PATCH (same fields, all optional)
const UpdateProviderSchema = CreateProviderSchema.partial();

// providers/test POST — does NOT require api_key to be persisted, just validated
const TestProviderSchema = z.object({
  base_url: z.string().url(),
  api_key: z.string().min(1),
  model: z.string().min(1).max(100),
});
// Response: { ok: true, data: { ok: boolean, latency_ms?: number, error?: string } }
```

**TDD steps per route:** same shape as M2.3. Additional test cases:
- providers DELETE on referenced provider → 409 `PROVIDER_IN_USE`
- providers/test upstream returns `ok: false, latency_ms: 0, error: "..."` → forwards as 200 with `{ok:false}` data shape (NOT an error envelope, since the test endpoint's whole point is "did it fail")

**Acceptance:**
- 4 new route files + 4 new test files
- 409 case covered

### M2.5 — Implement 6 BFF routes: voice, voice-summary, voice-context, voice/token, memory/preview, memory/[id]

**Files:**
- `app/api/cozy/chat/voice/route.ts` (multipart)
- `app/api/cozy/chat/voice-summary/route.ts`
- `app/api/cozy/chat/voice-context/route.ts`
- `app/api/cozy/voice/token/route.ts`
- `app/api/cozy/memory/preview/route.ts`
- `app/api/cozy/memory/[id]/route.ts`
+ tests

**Schemas:**

```typescript
// voice (multipart — FormData, not JSON)
const VoiceRequestSchema = z.object({
  session_id: z.string().uuid(),
  personality_id: z.string().uuid(),
  audio: z.instanceof(Blob),  // or File
});
// Response: { ok: true, data: { transcript: string, reply_text: string, reply_audio_url: string, message_id: string } }

// voice-summary
const VoiceSummaryRequestSchema = z.object({
  session_id: z.string().uuid(),
  turns: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })).max(200),
  tool_calls: z.array(z.object({ name: z.string(), args: z.any(), result: z.any() })).optional(),
});

// voice-context
const VoiceContextRequestSchema = z.object({
  session_id: z.string().uuid(),
});

// voice/token
const VoiceTokenSchema = z.object({
  session_id: z.string().uuid(),
  personality_id: z.string().uuid(),
});

// memory/preview
// GET, no body. Response: { ok: true, data: { short_term: [], long_term: [], profile: {}, knowledge: [], errors: [] } }

// memory/[id] DELETE
// no body. Response: { ok: true, data: { id: string, deleted: true } }
```

**TDD steps per route:** same shape. For voice:
- `multipart/form-data` parsing: missing audio Blob → 400
- Forward audio Blob to upstream without buffering the bytes (use `req.formData()` then re-stream)

**Acceptance:**
- 6 new route files + 6 new test files
- Multipart path verified

### M2.6 — SSE error event normalization in client

**Files:** `src/lib/api/chat.ts` (extend), `src/lib/api/chat.test.ts` (extend)

**TDD steps:**

1. Add test cases:
   - SSE stream with `event: error\ndata: {"code":"RATE_LIMITED","message":"slow down"}\n\n` → throws `new ApiError("RATE_LIMITED", "slow down", true)`
   - SSE stream with `event: error\ndata: {"code":"PROVIDER_QUOTA_EXCEEDED","message":"quota used"}\n\n` → throws `ApiError` with retryable=true
   - Fetch ReadableStream errors mid-stream → throws `new ApiError("STREAM_INTERRUPTED", ..., true)`
   - User aborts → throws `new ApiError("ABORTED", ..., false)` (existing behavior; preserve)
2. Extend parser to track `event` type. On `event === "error"`, parse JSON, capture `{code, message, retryable}`.
3. Wrap the fetch `body.getReader()` in a try/catch that re-throws as `STREAM_INTERRUPTED` (only if not aborted).
4. Make the async iterator's `throw()` rethrow the captured error (it currently throws "Stream interrupted" as a plain Error).

**Acceptance:**
- Existing 4 chat tests still pass
- New SSE error event tests pass
- `ApiError` thrown, not generic Error

### M2.7 — BFF rate limiting middleware

**Files:** `middleware.ts` (new), `src/lib/api/rate-limit.ts` (new), tests

**TDD steps:**

1. `rate-limit.ts`:
   - `RateLimiter` class with `check(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSec: number }`
   - In-memory `Map<string, number[]>` of timestamps
   - Sliding window: drop timestamps older than `windowMs`, count remaining, allow if < limit
2. `middleware.ts`:
   - Match `/api/cozy/*` paths
   - Key = `${ip}:${routeKey}` where routeKey is `auth.login` for `/api/cozy/auth` POST, else `default`
   - On limit: 429 with `RATE_LIMITED` envelope + `Retry-After` header
   - IP from `x-forwarded-for` first, else `x-real-ip`, else `"unknown"`
3. Tests:
   - 5 requests to `/api/cozy/auth` within 1 minute → 6th returns 429 with `RATE_LIMITED` envelope
   - `Retry-After` header present and ≥ 1
   - Different IPs counted separately
   - Login limit (5/min) is stricter than default (60/min)
   - Window expires: after 61 seconds (fake timers), counter resets

**Acceptance:**
- Middleware matches and applies
- Tests pass
- Build doesn't break (Next 15 middleware still works with API routes)

### M2.8 — WebSocket /api/ws/chat proxy

**Files:** `app/api/ws/chat/route.ts` (new), test

**TDD steps:**

1. Test:
   - Mock `WebSocketPair` (Node 22+) — note: WebSocket testing is finicky. M2 ships the route but uses a **smoke test** that asserts the file exists, exports a GET handler, and validates the JWT rejection path (no WebSocket upgrade → 401). Full WebSocket proxy integration test is M4 work.
2. Implementation:
   - `export const runtime = "nodejs"` (required for WebSocket)
   - GET handler: read `?token=...` query, reject if missing/expired (just signature check, not full validation)
   - Open upstream `WebSocket(${COZY_ENGINE_URL}/v1/ws/chat?token=...)`
   - Pipe messages

**Acceptance:**
- Route file exists, runtime=nodejs, GET handler exported
- 401 path covered
- Full integration test marked as future M4 work in the test

### M2.9 — Contract tests against CozyEngineV2 fixtures

**Files:** `tests/contract/_setup.ts` + `tests/contract/fixtures/*.json` + `tests/contract/*.contract.test.ts`

**Pattern:**

```typescript
// tests/contract/_setup.ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";
export const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

For each route, the contract test:
1. Loads the fixture (e.g. `chat.completions.sse.json` = `{ upstreamRequest: {...}, upstreamResponse: {status, headers, body} }`)
2. MSW replays the upstream response when the BFF calls CozyEngineV2
3. Calls the BFF handler (or hits the route via fetch in a Next.js test server)
4. Asserts:
   - Outbound request body matches `fixture.upstreamRequest.body` (zod-validated)
   - Outbound `Authorization` header has JWT
   - Outbound URL is the expected CozyEngineV2 path
   - Inbound response is the expected shape (success envelope or error envelope)

**Fixtures are frozen snapshots** of what CozyEngineV2 returns. When CozyEngineV2 changes its response shape, fixture diffs surface as test failures — which is exactly what we want.

**Acceptance:**
- 14 contract test files (one per route)
- ~20 fixture JSON files
- `pnpm test tests/contract` passes

---

## 5. BFF request/response matrix

| Route | Method | BFF path | Upstream | Body | Response |
|---|---|---|---|---|---|
| auth | POST | `/api/cozy/auth` | `/v1/auth/login` | `{email, password}` | `{ok, data: {jwt, userId, email, role}}` |
| chat | POST | `/api/cozy/chat` | `/v1/chat/completions` | `{session_id, personality_id, message, model?}` | SSE passthrough |
| chat/async | POST | `/api/cozy/chat/async` | `/v1/chat/async` | same as chat | `{ok, data: {task_id, status}}` |
| chat/voice | POST | `/api/cozy/chat/voice` | `/v1/voice/chat` | multipart `{session_id, personality_id, audio}` | `{ok, data: {transcript, reply_text, reply_audio_url, message_id}}` |
| chat/voice-token | POST | `/api/cozy/chat/voice-token` | `/v1/voice/token` | `{session_id, personality_id}` | `{ok, data: {token, url, room}}` |
| chat/voice-summary | POST | `/api/cozy/chat/voice-summary` | `/v1/chat/voice_summary` | `{session_id, turns[], tool_calls?}` | `{ok, data: {saved_message_ids: []}}` |
| chat/voice-context | POST | `/api/cozy/chat/voice-context` | `/v1/chat/voice_context` | `{session_id}` | `{ok, data: {context: []}}` |
| sessions | GET | `/api/cozy/sessions` | `/v1/sessions` | — | `{ok, data: {sessions: []}}` |
| sessions | POST | `/api/cozy/sessions` | `/v1/sessions` | `{personality_id?, title?}` | `{ok, data: Session}` |
| sessions/[id] | GET | `/api/cozy/sessions/[id]` | `/v1/sessions/[id]` | — | `{ok, data: Session}` |
| sessions/[id] | PATCH | `/api/cozy/sessions/[id]` | `/v1/sessions/[id]` | `{title?, personality_id?}` | `{ok, data: Session}` |
| sessions/[id] | DELETE | `/api/cozy/sessions/[id]` | `/v1/sessions/[id]` | — | `{ok, data: {id, deleted}}` |
| personalities | GET | `/api/cozy/personalities` | `/v1/personalities` | — | `{ok, data: {personalities: []}}` |
| personalities | POST | `/api/cozy/personalities` | `/v1/personalities` | `{name, system_prompt, ...}` | `{ok, data: Personality}` |
| providers | GET | `/api/cozy/providers` | `/v1/users/me/providers` | — | `{ok, data: {providers: []}}` |
| providers | POST | `/api/cozy/providers` | `/v1/users/me/providers` | `{label, base_url, api_key, model, is_default?}` | `{ok, data: Provider}` |
| providers/[id] | GET | `/api/cozy/providers/[id]` | `/v1/users/me/providers/[id]` | — | `{ok, data: Provider}` |
| providers/[id] | PATCH | `/api/cozy/providers/[id]` | `/v1/users/me/providers/[id]` | partial | `{ok, data: Provider}` |
| providers/[id] | DELETE | `/api/cozy/providers/[id]` | `/v1/users/me/providers/[id]` | — | `{ok, data: {id, deleted}}` or 409 `PROVIDER_IN_USE` |
| providers/test | POST | `/api/cozy/providers/test` | `/v1/users/me/providers/test` | `{base_url, api_key, model}` | `{ok, data: {ok, latency_ms, error?}}` |
| memory/preview | GET | `/api/cozy/memory/preview` | CozyMemory `/api/v1/context` | — | `{ok, data: {short_term, long_term, profile, knowledge, errors}}` |
| memory/[id] | DELETE | `/api/cozy/memory/[id]` | CozyMemory `/api/v1/memories/[id]` | — | `{ok, data: {id, deleted}}` |
| voice/token | POST | `/api/cozy/voice/token` | `/v1/voice/token` | `{session_id, personality_id}` | `{ok, data: {token, url, room}}` |
| ws/chat | GET (upgrade) | `/api/ws/chat` | `/v1/ws/chat` | — | WebSocket passthrough |

---

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WebSocket proxy hard to test in Next.js | High | Med | M2 ships route + smoke test; full integration is M4 |
| Multipart `FormData` streaming through BFF | Med | Med | Use `req.formData()` once, forward `Blob` directly to fetch body; do not buffer bytes |
| Rate limit `Map` leaks memory under high traffic | Med | Low | Lazy GC on each request; 60s window means at most 60 entries per IP. Acceptable for v1.0 single-instance. |
| Contract test fixtures drift from real CozyEngineV2 | Med | Med | Pin fixture `version` field; CI fails on unaccounted diff |
| MSW + Node fetch in same process as BFF handler | Med | Med | Run BFF handler directly (not via `fetch`), pass `Request` object — eliminates inter-process fetch and makes MSW reliable |
| `ApiError.code` field in upstream body could be a string we don't recognize | Low | Low | `normalize()` only trusts `ErrorCode` values; unknown codes fall through to `UNKNOWN` |

---

## 7. Verification gates

Before merge to main, all must be green:

- [ ] `pnpm typecheck` — no errors
- [ ] `pnpm lint` — 0 errors, 0 warnings
- [ ] `pnpm test` — 50+ tests across 25+ files (target: 22 M1 tests + 28 new tests for M2)
- [ ] `pnpm build:web` — succeeds
- [ ] `pnpm build:embed` — succeeds
- [ ] Manual smoke: hit each new BFF route with `curl` against a mock CozyEngineV2 and confirm response shape

---

## 8. Out-of-scope for M2 (will be planned in later milestones)

- M3: Tauri + Capacitor shells
- M4: WebSocket client reconnection, async task polling, ToolCall, custom LLM provider UI, file upload
- M5: TTS / STT real implementations, LiveKit SDK
- M6: Embed widget full features (loader.js, postMessage)
- M7: Themes + warmth + a11y
- M8: Performance + E2E + Sentry + release

---

## 9. References

- Design spec: `docs/superpowers/specs/2026-06-10-cozycopilot-design.md` §4-7
- M1 plan: `docs/superpowers/plans/2026-06-10-cozycopilot-plan.md`
- M1 final doc: `docs/superpowers/m1-complete.md` (post-merge)
- CozyEngineV2 OpenAPI: (out of scope; contract tests pin the wire format)
