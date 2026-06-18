/**
 * LiveKit configuration shared by the realtime voice-call feature.
 *
 * The URL is exposed via `NEXT_PUBLIC_LIVEKIT_URL` so the browser bundle can
 * connect directly to the LiveKit server. The BFF hands out short-lived
 * tokens via `/api/cozy/voice/token`; the URL itself is intentionally public.
 *
 * The fallback points at `livekit.example.com` — it is NOT a real server. In
 * production the env var must be set or every call will fail with
 * `LIVEKIT_FAILED` (the hook flips to the error state and the panel surfaces
 * the degradation CTA).
 */
export const LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "wss://livekit.example.com";

/**
 * BFF route that issues a LiveKit access token. Lives in `app/api/cozy/voice`
 * — see `app/api/cozy/voice/token/route.ts` for the upstream call.
 */
export const LIVEKIT_TOKEN_ENDPOINT = "/api/cozy/voice/token";

/**
 * BFF route that accepts a finished-call summary. The M5.6 BFF may not exist
 * yet at the time M5.5 lands; the hook still POSTs to it because the
 * degradation is harmless (the call summary is best-effort).
 */
export const VOICE_SUMMARY_ENDPOINT = "/api/cozy/voice/summary";
