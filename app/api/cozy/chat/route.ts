import { z } from "zod";
import {
  parseJsonBody,
  passThroughSSE,
  unauthorizedResponse,
  validateBody,
} from "@/lib/api/bff";

const ChatRequestSchema = z.object({
  session_id: z.string().uuid(),
  personality_id: z.string().uuid(),
  message: z.string().min(1).max(10000),
  model: z.string().optional(),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return unauthorizedResponse();
  }

  const parsedJson = await parseJsonBody(req);
  if (!parsedJson.ok) return parsedJson.response;

  const validated = validateBody(parsedJson.body, ChatRequestSchema);
  if (!validated.ok) return validated.response;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify(validated.data),
  });

  return passThroughSSE(upstream);
}
