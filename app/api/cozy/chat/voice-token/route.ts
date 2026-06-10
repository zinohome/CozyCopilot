import { z } from "zod";
import {
  errorResponseFromUpstream,
  parseJsonBody,
  unauthorizedResponse,
  validateBody,
} from "@/lib/api/bff";

const VoiceTokenRequestSchema = z.object({
  session_id: z.string().uuid(),
  personality_id: z.string().uuid(),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();

  const parsedJson = await parseJsonBody(req);
  if (!parsedJson.ok) return parsedJson.response;

  const validated = validateBody(parsedJson.body, VoiceTokenRequestSchema);
  if (!validated.ok) return validated.response;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/voice/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify(validated.data),
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
