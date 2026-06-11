import { z } from "zod";
import {
  errorResponseFromUpstream,
  parseJsonBody,
  unauthorizedResponse,
  validateBody,
} from "@/lib/api/bff";

const CreateSessionSchema = z.object({
  personality_id: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

function authHeader(req: Request): Response | string {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();
  return auth;
}

async function readUpstreamErrorBody(upstream: Response): Promise<unknown> {
  try {
    return await upstream.json();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const auth = authHeader(req);
  if (typeof auth !== "string") return auth;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/sessions`, {
    method: "GET",
    headers: { Authorization: auth },
  });

  if (!upstream.ok) {
    return errorResponseFromUpstream(upstream.status, await readUpstreamErrorBody(upstream));
  }

  const data = await upstream.json();
  return Response.json({ ok: true, data });
}

export async function POST(req: Request) {
  const auth = authHeader(req);
  if (typeof auth !== "string") return auth;

  const parsedJson = await parseJsonBody(req);
  if (!parsedJson.ok) return parsedJson.response;

  const validated = validateBody(parsedJson.body, CreateSessionSchema);
  if (!validated.ok) return validated.response;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify(validated.data),
  });

  if (!upstream.ok) {
    return errorResponseFromUpstream(upstream.status, await readUpstreamErrorBody(upstream));
  }

  const data = await upstream.json();
  return Response.json({ ok: true, data });
}
