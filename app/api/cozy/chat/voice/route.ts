import { z } from "zod";
import {
  errorResponse,
  errorResponseFromUpstream,
  unauthorizedResponse,
  validationResponse,
} from "@/lib/api/bff";

const VoiceFormSchema = z.object({
  session_id: z.string().uuid(),
  personality_id: z.string().uuid(),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();

  // Multipart: req.formData() consumes the body stream. We must read it here
  // and rebuild a fresh FormData for the upstream fetch — we cannot forward
  // the consumed stream. Audio Blob is checked separately so the user gets a
  // friendlier message than a zod schema error.
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return errorResponse({
      code: "VALIDATION_ERROR",
      message: "missing audio file",
      status: 400,
    });
  }

  const fields = {
    session_id: form.get("session_id"),
    personality_id: form.get("personality_id"),
  };
  const parsed = VoiceFormSchema.safeParse(fields);
  if (!parsed.success) return validationResponse(parsed.error);

  const upstreamForm = new FormData();
  upstreamForm.set("session_id", parsed.data.session_id);
  upstreamForm.set("personality_id", parsed.data.personality_id);
  upstreamForm.set("audio", audio);

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/voice/chat`, {
    method: "POST",
    // DO NOT set Content-Type — fetch will compute it with the multipart
    // boundary. Setting it manually would strip the boundary and break
    // upstream parsing.
    headers: { Authorization: auth },
    body: upstreamForm,
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
