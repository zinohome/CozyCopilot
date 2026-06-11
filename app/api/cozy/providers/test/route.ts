import { z } from "zod";
import {
  errorResponseFromUpstream,
  parseJsonBody,
  unauthorizedResponse,
  validateBody,
} from "@/lib/api/bff";

const TestProviderSchema = z.object({
  base_url: z.string().url(),
  api_key: z.string().min(1),
  model: z.string().min(1).max(100),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

async function readUpstreamErrorBody(upstream: Response): Promise<unknown> {
  try {
    return await upstream.json();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();

  const parsedJson = await parseJsonBody(req);
  if (!parsedJson.ok) return parsedJson.response;

  const validated = validateBody(parsedJson.body, TestProviderSchema);
  if (!validated.ok) return validated.response;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/users/me/providers/test`, {
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

  // The test endpoint reports its own success/failure through a `ok` flag in
  // the body, even on 200. We must not treat `ok: false` here as a BFF error —
  // it's the structured test result the UI is meant to display.
  const data = await upstream.json();
  return Response.json({ ok: true, data });
}
