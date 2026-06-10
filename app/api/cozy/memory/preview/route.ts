import { errorResponseFromUpstream, unauthorizedResponse } from "@/lib/api/bff";

const COZY_MEMORY_URL = process.env.COZY_MEMORY_URL ?? "http://localhost:8001";
const COZY_MEMORY_API_KEY = process.env.COZY_MEMORY_API_KEY ?? "";

export async function GET(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();

  const upstream = await fetch(`${COZY_MEMORY_URL}/api/v1/context`, {
    method: "GET",
    headers: {
      "X-Cozy-API-Key": COZY_MEMORY_API_KEY,
      // Forward the user JWT for upstream tracing/audit. CozyMemory's
      // authorization decision is made via X-Cozy-API-Key (the BFF's
      // service key), not this header.
      Authorization: auth,
    },
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
