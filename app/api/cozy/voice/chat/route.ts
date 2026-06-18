// BFF route for non-realtime voice chat (spec §6.4 stream D).
// Accepts a multipart audio upload + session/personality UUIDs, forwards to
// CozyEngineV2 /v1/voice/chat, and returns the canonical envelope
// { transcript, reply_text, reply_audio_url, message_id }.
//
// Mirrors the structure of app/api/cozy/upload/route.ts. The only meaningful
// differences are the multipart field names (audio + session_id/personality_id)
// and the upstream response shape — there is no file/asset URL here, just the
// voice turn envelope.

import {
  errorResponse,
  errorResponseFromUpstream,
  unauthorizedResponse,
} from "@/lib/api/bff";

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

const ALLOWED_AUDIO_MIME = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
];

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();

  // Multipart: req.formData() consumes the body stream. Per the M5.3 brief
  // we re-stream the original FormData to upstream (the audio Blob is a
  // reference, not yet consumed, so we can pass it through as-is).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse({
      code: "INVALID_BODY",
      message: "expected multipart/form-data",
      status: 400,
    });
  }

  const audio = form.get("audio");
  const sessionId = form.get("session_id");
  const personalityId = form.get("personality_id");

  if (!(audio instanceof Blob)) {
    return errorResponse({
      code: "MISSING_FILE",
      message: "audio field required",
      status: 400,
    });
  }
  if (typeof sessionId !== "string" || !isUuid(sessionId)) {
    return errorResponse({
      code: "VALIDATION_ERROR",
      message: "session_id must be UUID",
      status: 400,
    });
  }
  if (typeof personalityId !== "string" || !isUuid(personalityId)) {
    return errorResponse({
      code: "VALIDATION_ERROR",
      message: "personality_id must be UUID",
      status: 400,
    });
  }
  if (audio.size === 0) {
    return errorResponse({
      code: "EMPTY_FILE",
      message: "audio is empty",
      status: 400,
    });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return errorResponse({
      code: "FILE_TOO_LARGE",
      message: "audio > 10MB",
      status: 413,
    });
  }
  if (!ALLOWED_AUDIO_MIME.includes(audio.type)) {
    return errorResponse({
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: `unsupported audio type: ${audio.type}`,
      status: 415,
    });
  }

  // Forward as multipart to upstream. DO NOT set Content-Type — fetch will
  // compute it with the multipart boundary. Setting it manually would strip
  // the boundary and break upstream parsing.
  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/voice/chat`, {
    method: "POST",
    headers: { Authorization: auth },
    body: form, // re-stream the multipart body (per brief)
  });

  if (!upstream.ok) {
    let body: unknown = null;
    try {
      body = await upstream.json();
    } catch {
      /* non-JSON upstream error */
    }
    return errorResponseFromUpstream(upstream.status, body);
  }

  const data = await upstream.json();
  return Response.json({ ok: true, data });
}
