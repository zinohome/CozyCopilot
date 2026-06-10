import { z } from "zod";

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
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "missing bearer token",
          userMessage: "请重新登录",
          retryable: false,
        },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "invalid json",
          userMessage: "请求格式有误",
          retryable: false,
        },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.message,
          userMessage: "请求格式有误",
          retryable: false,
        },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify(parsed.data),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: `upstream HTTP ${upstream.status}`,
          userMessage: "服务暂时不可用，请稍后重试",
          retryable: true,
        },
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Passthrough SSE — no buffering
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
