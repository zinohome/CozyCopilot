import { z } from "zod";
import {
  errorResponseFromUpstream,
  parseJsonBody,
  unauthorizedResponse,
  validateBody,
} from "@/lib/api/bff";

const VoiceSummarySchema = z.object({
  session_id: z.string().uuid(),
  turns: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      text: z.string().min(1),
      at: z.string().datetime(),
    }),
  ),
  tool_calls: z.array(
    z.object({
      name: z.string().min(1),
      arguments: z.unknown(),
      result: z.unknown().optional(),
    }),
  ),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();

  const parsedJson = await parseJsonBody(req);
  if (!parsedJson.ok) return parsedJson.response;

  const validated = validateBody(parsedJson.body, VoiceSummarySchema);
  if (!validated.ok) return validated.response;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/chat/voice_summary`, {
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
