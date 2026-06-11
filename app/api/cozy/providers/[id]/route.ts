import { z } from "zod";
import {
  errorResponseFromUpstream,
  parseJsonBody,
  unauthorizedResponse,
  validateBody,
} from "@/lib/api/bff";

const UpdateProviderSchema = z
  .object({
    label: z.string().min(1).max(100).optional(),
    base_url: z.string().url().optional(),
    api_key: z.string().min(1).optional(),
    model: z.string().min(1).max(100).optional(),
    is_default: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "at least one field required",
  });

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

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
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();
  const { id } = await params;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/users/me/providers/${id}`, {
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
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();
  const { id } = await params;

  const parsedJson = await parseJsonBody(req);
  if (!parsedJson.ok) return parsedJson.response;

  const validated = validateBody(parsedJson.body, UpdateProviderSchema);
  if (!validated.ok) return validated.response;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/users/me/providers/${id}`, {
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
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();
  const { id } = await params;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/users/me/providers/${id}`, {
    method: "DELETE",
    headers: { Authorization: auth },
  });

  if (!upstream.ok) {
    return errorResponseFromUpstream(upstream.status, await readUpstreamErrorBody(upstream));
  }

  const data = await upstream.json();
  return Response.json({ ok: true, data });
}
