import { z } from "zod";
import {
  errorResponseFromUpstream,
  parseJsonBody,
  unauthorizedResponse,
  validateBody,
} from "@/lib/api/bff";

const UpdateSessionSchema = z
  .object({
    title: z.string().max(200).optional(),
    personality_id: z.string().uuid().optional(),
  })
  .refine((o) => o.title !== undefined || o.personality_id !== undefined, {
    message: "at least one of title or personality_id required",
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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authHeader(req);
  if (typeof auth !== "string") return auth;
  const { id } = await params;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/sessions/${id}`, {
    method: "GET",
    headers: { Authorization: auth },
  });

  if (!upstream.ok) {
    return errorResponseFromUpstream(upstream.status, await readUpstreamErrorBody(upstream));
  }

  const data = await upstream.json();
  return Response.json({ ok: true, data });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authHeader(req);
  if (typeof auth !== "string") return auth;
  const { id } = await params;

  const parsedJson = await parseJsonBody(req);
  if (!parsedJson.ok) return parsedJson.response;

  const validated = validateBody(parsedJson.body, UpdateSessionSchema);
  if (!validated.ok) return validated.response;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/sessions/${id}`, {
    method: "PATCH",
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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authHeader(req);
  if (typeof auth !== "string") return auth;
  const { id } = await params;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/sessions/${id}`, {
    method: "DELETE",
    headers: { Authorization: auth },
  });

  if (!upstream.ok) {
    return errorResponseFromUpstream(upstream.status, await readUpstreamErrorBody(upstream));
  }

  const data = await upstream.json();
  return Response.json({ ok: true, data });
}
