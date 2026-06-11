import { z } from "zod";
import {
  errorResponseFromUpstream,
  parseJsonBody,
  unauthorizedResponse,
  validateBody,
} from "@/lib/api/bff";

const CreatePersonalitySchema = z.object({
  name: z.string().min(1).max(100),
  system_prompt: z.string().min(1).max(8000),
  description: z.string().max(500).optional(),
  avatar_url: z.string().url().optional(),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

async function readUpstreamErrorBody(upstream: Response): Promise<unknown> {
  try {
    return await upstream.json();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/personalities`, {
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
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();

  const parsedJson = await parseJsonBody(req);
  if (!parsedJson.ok) return parsedJson.response;

  const validated = validateBody(parsedJson.body, CreatePersonalitySchema);
  if (!validated.ok) return validated.response;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/personalities`, {
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
