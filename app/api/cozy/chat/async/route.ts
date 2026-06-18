import { z } from "zod";
import {
  errorResponse,
  errorResponseFromUpstream,
  parseJsonBody,
  unauthorizedResponse,
  validateBody,
} from "@/lib/api/bff";

const AsyncRequestSchema = z.object({
  session_id: z.string().uuid(),
  personality_id: z.string().uuid(),
  message: z.string().min(1).max(10000),
  model: z.string().optional(),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();

  const parsedJson = await parseJsonBody(req);
  if (!parsedJson.ok) return parsedJson.response;

  const validated = validateBody(parsedJson.body, AsyncRequestSchema);
  if (!validated.ok) return validated.response;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/chat/async`, {
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

/**
 * Polling endpoint for the M4.2 useAsyncTask hook. Returns the current
 * task status from CozyEngineV2. Used when WebSocket push is unavailable.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();

  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId");
  if (!taskId) {
    return errorResponse({
      code: "MISSING_TASK_ID",
      message: "taskId query param is required",
      status: 400,
    });
  }

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/chat/async/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Authorization: auth },
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
  return Response.json(data);
}
