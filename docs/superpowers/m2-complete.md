# M2 Complete — BFF Coverage, Error Normalization, Contract Tests

**Milestone:** M2 of 8
**Date:** 2026-06-15
**Branch:** `feat/m2-bff-coverage`
**Status:** ✅ Merged

---

## 1. Outcome

M2 closed the BFF coverage gap from M1. **All 16 BFF routes + 1 WebSocket proxy** are now in place, all errors flow through a single `ErrorCode` normalizer with the spec's 20 codes, all routes are exercised by **contract tests** that pin the BFF↔CozyEngineV2 wire format, and a **rate-limit middleware** protects against BFF abuse.

After M2 the BFF is **feature-complete** from the CozyEngineV2 spec's standpoint. M3–M8 are pure-frontend work (UI features, capabilities, polish).

---

## 2. Deliverable gates (all green)

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm lint` | ✅ 0 errors, 0 warnings (`--max-warnings 0`) |
| `pnpm test` | ✅ **231/231 pass** across 36 files |
| `pnpm build:web` | ✅ succeeds, Middleware 34.8 kB |
| `pnpm build:embed` | (unchanged from M1) ✅ |
| BFF route count | ✅ 16 routes + 1 WS proxy (all from spec) |

**Test breakdown:**
- 22 M1 (auth, chat, store, feature, smoke, client, errors)
- 18 `bff.ts` helpers
- 16 `errors.test.ts` (ErrorCode union + normalize)
- 7 `rate-limit.test.ts` (RateLimiter)
- 7 `middleware.test.ts` (integration)
- 11 `chat/async` + 11 `chat/voice-token` + 11 `sessions` + 12 `sessions/[id]` (M2.3)
- 10 `personalities` + 12 `providers` + 15 `providers/[id]` + 8 `providers/test` (M2.4)
- 8 `chat/voice` + 6 `voice-summary` + 5 `voice-context` + 6 `voice/token` + 4 `memory/preview` + 5 `memory/[id]` (M2.5)
- 10 `chat.test.ts` (3 originals + 7 new SSE error cases)
- 4 `ws/chat` (smoke + 401 + 503)
- 26 contract tests across 7 files (M2.8)

---

## 3. What shipped

### 3.1 BFF routes (16 + 1 WS)

**M1 (refactored to use bff.ts helpers):**
- `POST /api/cozy/auth` → `/v1/auth/login`
- `POST /api/cozy/chat` → `/v1/chat/completions` (SSE passthrough)

**M2.3 — chat/async + sessions:**
- `POST /api/cozy/chat/async` → `/v1/chat/async`
- `POST /api/cozy/chat/voice-token` → `/v1/voice/token`
- `GET/POST /api/cozy/sessions` → `/v1/sessions`
- `GET/PATCH/DELETE /api/cozy/sessions/[id]` → `/v1/sessions/[id]`

**M2.4 — personalities + providers:**
- `GET/POST /api/cozy/personalities` → `/v1/personalities`
- `GET/POST /api/cozy/providers` → `/v1/users/me/providers`
- `GET/PATCH/DELETE /api/cozy/providers/[id]` → `/v1/users/me/providers/[id]`
- `POST /api/cozy/providers/test` → `/v1/users/me/providers/test` (special: 200 with `{ok:false,...}` is a test result, NOT an error envelope)

**M2.5 — voice + memory:**
- `POST /api/cozy/chat/voice` → `/v1/voice/chat` (multipart, audio Blob streaming)
- `POST /api/cozy/chat/voice-summary` → `/v1/chat/voice_summary`
- `POST /api/cozy/chat/voice-context` → `/v1/chat/voice_context`
- `POST /api/cozy/voice/token` → `/v1/voice/token` (separate from `chat/voice-token`; LiveKit Realtime flow)
- `GET /api/cozy/memory/preview` → CozyMemory `/api/v1/context` (dual-auth: user JWT + `X-Cozy-API-Key` service key)
- `DELETE /api/cozy/memory/[id]` → CozyMemory `/api/v1/memories/[id]`

**M2 final — WebSocket:**
- `GET /api/ws/chat` (upgrade) → `/v1/ws/chat` (relay)

### 3.2 Lib (`src/lib/api/`)

- `bff.ts` — 7 helpers: `errorResponse`, `unauthorizedResponse`, `validationResponse`, `errorResponseFromUpstream`, `passThroughSSE`, `parseJsonBody`, `validateBody`
- `errors.ts` — `ApiError` class + 20-code `ErrorCode` union + `ERROR_CODES` metadata map + `normalize(status, body)` + `statusToCode()`
- `rate-limit.ts` — pure `RateLimiter` class (sliding window, lazy GC)
- `chat.ts` — `streamChat` extended to handle `event: error` SSE events + `STREAM_INTERRUPTED` on stream read failure

### 3.3 Middleware

- `middleware.ts` (repo root) — Next.js middleware matching `/api/cozy/:path*`
  - Default: 60 req/min/IP
  - Login (`POST /api/cozy/auth`): 5 req/min/IP (stricter to prevent brute-force)
  - IP from `x-forwarded-for` first hop → `x-real-ip` → `"unknown"`
  - 429 with `RATE_LIMITED` envelope + `Retry-After` + `X-RateLimit-Limit/Remaining` headers
  - Env overrides: `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_LOGIN`

### 3.4 Contract tests (`tests/contract/`)

- 23 frozen fixture JSONs (one per route) — pin CozyEngineV2 wire format
- 7 test files, 26 contract tests
- Each test asserts: outbound URL path, outbound method, outbound `Authorization` header, response status, response body shape
- SSE test asserts `Content-Type: text/event-stream` + `res.body instanceof ReadableStream` (no chunk-by-chunk semantics — would defeat pass-through)
- Multipart (`chat/voice`) skipped with documented rationale + unit-test fallback
- Drift detection: change a fixture's `pathname`, the contract test fails with a clear diff

---

## 4. Key design decisions

### 4.1 `bff.ts` is the keystone

The 7-helper module centralizes the error envelope. Every new BFF route is now a 5-line file (auth check → parse body → validate → fetch → return). The M2.1 code-quality review flagged a "build-then-adopt" risk for `errorResponseFromUpstream`; M2.3-M2.5 confirmed it was adopted (verified by grep — every M2 route uses it).

### 4.2 `ErrorCode` union + `normalize()` is the source of truth

20 codes with metadata (status + userMessage + retryable + showToUser). The runtime completeness check (`Object.keys(ERROR_CODES).sort() === [...unionCodes].sort()`) catches future drift.

### 4.3 Spec deviation: 5xx maps to `PROVIDER_UNAVAILABLE`, not `UNKNOWN`

The spec's §7.2 table lists `UNKNOWN` as the catch-all for 5xx, but `bff.ts` maps any 5xx to `PROVIDER_UNAVAILABLE` and reserves `UNKNOWN` for ambiguous 4xx/200. This was caught by the M2.3 implementer (test correction) and confirmed by the spec reviewer. **Documented deviation; flag for spec reconciliation in M7/M8.**

### 4.4 `PROVIDER_IN_USE` user message interpretation

Spec says "此 provider 正在被 **X 个会话引用**" (templated count). The static map value is "此 provider 正在被引用，无法删除" (complete sentence). The dynamic count is the BFF's responsibility to append. Code reviewer confirmed this is a sensible interpretation.

### 4.5 Multipart `chat.voice` is the only multipart route

The route consumes the request body's `FormData` (jsdom has a broken polyfill — test imports `Request`/`FormData` from `undici`), validates fields + audio Blob separately (friendlier error for missing audio), then rebuilds a fresh `FormData` for the upstream fetch. `Content-Type` is intentionally NOT set on the upstream fetch — let fetch compute the multipart boundary.

### 4.6 CozyMemory uses dual-auth

`memory/preview` and `memory/[id]` validate the user JWT (rejects anonymous) but use a BFF-side `X-Cozy-API-Key` service key to call CozyMemory. The user JWT is also forwarded for upstream tracing. The dual-auth pattern is verified by an explicit test in `memory/[id]/route.test.ts`.

### 4.7 WebSocket proxy uses `WebSocketPair`

Next.js 15's Node runtime provides a `WebSocketPair` global for upgrade handling. In jsdom (vitest), it's absent — the route returns 503 `WS_DISCONNECTED`. Production usage gets the actual upgrade. Full client-side reconnection logic is M4 work.

---

## 5. Files added (M2 only)

74 files changed since M1 merge (`ad7a903`), 6382 insertions:

```
app/api/cozy/auth/route.ts                    (refactored: 78 → 50 LOC, -36%)
app/api/cozy/chat/route.ts                    (refactored: 95 → 40 LOC, -58%)
app/api/cozy/chat/async/route.ts              (new, 49 LOC)
app/api/cozy/chat/voice-token/route.ts        (new, 47 LOC)
app/api/cozy/chat/voice/route.ts              (new, 67 LOC, multipart)
app/api/cozy/chat/voice-summary/route.ts      (new, 64 LOC)
app/api/cozy/chat/voice-context/route.ts      (new, 46 LOC)
app/api/cozy/voice/token/route.ts             (new, 47 LOC)
app/api/cozy/sessions/route.ts                (new, 72 LOC, GET + POST)
app/api/cozy/sessions/[id]/route.ts           (new, 105 LOC, GET + PATCH + DELETE)
app/api/cozy/personalities/route.ts           (new, 68 LOC)
app/api/cozy/providers/route.ts               (new, 69 LOC)
app/api/cozy/providers/[id]/route.ts          (new, 102 LOC)
app/api/cozy/providers/test/route.ts          (new, 53 LOC)
app/api/cozy/memory/preview/route.ts          (new, 33 LOC)
app/api/cozy/memory/[id]/route.ts             (new, 37 LOC)
app/api/ws/chat/route.ts                      (new, 124 LOC, WS proxy)
src/lib/api/bff.ts                            (new, 194 LOC, 7 helpers)
src/lib/api/errors.ts                         (extended: +181 LOC, 20-code union + normalize)
src/lib/api/rate-limit.ts                     (new, 67 LOC, RateLimiter class)
src/lib/api/chat.ts                           (extended: +30 LOC, SSE error events)
middleware.ts                                  (new, 73 LOC)
src/lib/api/bff.test.ts                       (new, 18 tests)
src/lib/api/errors.test.ts                    (new, 16 tests)
src/lib/api/rate-limit.test.ts                (new, 7 tests)
middleware.test.ts                            (new, 7 tests)
src/lib/api/chat.test.ts                      (extended: +7 SSE error tests)
+ 16 route.test.ts files for the 13 new routes
+ tests/contract/_setup.ts, fixtures/*.json (23), *.contract.test.ts (7 files, 26 tests)
.env.example                                  (new, documents RATE_LIMIT_*)
```

---

## 6. Commits on `feat/m2-bff-coverage`

```
f981946 test(contract): add CozyEngineV2 wire-format contract tests (23 fixtures)
b2de184 feat(chat): normalize SSE error events to ApiError (event: error + STREAM_INTERRUPTED)
089bbbb feat(bff): add voice, voice-summary, voice-context, voice/token, memory/preview, memory/[id] routes
a2f9781 feat(bff): add personalities, providers, providers/[id], providers/test routes
6477637 feat(bff): add rate limit middleware (60/min default, 5/min login)
efc2882 feat(bff): add chat/async, chat/voice-token, sessions, sessions/[id] routes
9f71776 refactor(bff): extract error envelope helper to lib/api/bff.ts
4b5df8a feat(errors): add ErrorCode union + normalize() helper (20 codes)
[ws commit] feat(ws): add /api/ws/chat WebSocket proxy (M2 thin relay)
```

(9 commits total; some landed after the rate-limit one was a fix-up.)

---

## 7. Risks remaining (M3+ work)

- **5xx → `PROVIDER_UNAVAILABLE` vs spec's `UNKNOWN`**: documented deviation; flag for spec reconciliation in M7/M8.
- **`BffErrorCode = string` placeholder**: the `bff.ts` helper's code field is still `string` for the M2.1→M2.2 boundary. M3+ can narrow to the real `ErrorCode` union via re-export. Not blocking.
- **`errorResponseFromUpstream` is the source of truth for upstream-error translation.** M3+ routes must use it.
- **WebSocket proxy integration tests are M4 work.** The smoke test verifies the file exists, exports runtime=nodejs, and rejects missing token + 503 fallback. Real end-to-end WS testing is M4 (when the client reconnection logic lands).
- **In-memory rate limit leaks under high traffic** (acceptable for v1.0 single-instance). Persistent store (Redis) is out of scope.

---

## 8. References

- M2 plan: `docs/superpowers/plans/2026-06-15-m2-bff-coverage.md`
- Design spec: `docs/superpowers/specs/2026-06-10-cozycopilot-design.md` §4-7
- M1 plan: `docs/superpowers/plans/2026-06-10-cozycopilot-plan.md`
- M1 final doc: `docs/superpowers/m1-complete.md` (post-merge)
