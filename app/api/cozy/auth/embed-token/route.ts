import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBody, validateBody } from "@/lib/api/bff";

const EmbedKeySchema = z.object({
  // Defense-in-depth: the upstream does the real key validation and
  // signing. We mirror the prefix+length shape here so a malformed
  // request bounces at the edge without hitting the engine.
  key: z.string().regex(/^ck_[A-Za-z0-9]{32}$/, {
    message: "embed key must match ck_ followed by 32 alphanumeric chars",
  }),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

/**
 * M6.4 — exchanges an embed API key (`ck_...`) for a short-lived JWT
 * the widget can attach to its outgoing requests.
 *
 * Why a BFF and not a direct widget → engine call? Two reasons:
 *   1. The widget runs cross-origin; we don't want to expose the
 *      engine's signing secret to the host page.
 *   2. The same BFF URL works for native shells (Tauri / Capacitor)
 *      where `fetch` is intercepted differently.
 *
 * Upstream ownership: CozyEngineV2 owns the JWT signing secret and
 * the rate-limit / key-rotation policy. Embed keys are short-lived
 * and revocable; the embed widget MUST go through the engine to get
 * a valid token.
 */
export async function POST(req: Request) {
  const parsedJson = await parseJsonBody(req, { userMessage: "请求格式错误" });
  if (!parsedJson.ok) return parsedJson.response;

  const validated = validateBody(parsedJson.body, EmbedKeySchema, {
    userMessage: "embed key 格式错误",
  });
  if (!validated.ok) return validated.response;

  let upstream: Response;
  try {
    upstream = await fetch(`${COZY_ENGINE_URL}/v1/auth/embed-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validated.data),
    });
  } catch {
    // Network error / engine unreachable. Surface as a retryable 502 so
    // the widget can show "稍后重试" without surfacing the URL.
    return errorResponse({
      code: "PROVIDER_UNAVAILABLE",
      message: "embed token exchange failed: engine unreachable",
      status: 502,
      userMessage: "认证失败，请稍后重试",
      retryable: true,
    });
  }

  if (!upstream.ok) {
    const isUnauthorized = upstream.status === 401;
    return errorResponse({
      code: isUnauthorized ? "UNAUTHORIZED" : "UNKNOWN",
      message: "embed token exchange failed",
      status: upstream.status,
      userMessage: isUnauthorized ? "embed key 无效" : "认证失败，请稍后重试",
      retryable: !isUnauthorized,
    });
  }

  const data = await upstream.json();
  return NextResponse.json({
    ok: true,
    data: {
      jwt: data.access_token,
      userId: data.user_id,
      email: data.email ?? "embed@cozycopilot.com",
      role: data.role ?? "user",
    },
  });
}
