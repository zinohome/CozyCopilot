import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBody, validateBody } from "@/lib/api/bff";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const parsedJson = await parseJsonBody(req, {
    userMessage: "请输入有效的邮箱和密码",
  });
  if (!parsedJson.ok) return parsedJson.response;

  const validated = validateBody(parsedJson.body, LoginSchema, {
    userMessage: "请输入有效的邮箱和密码",
  });
  if (!validated.ok) return validated.response;

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validated.data),
  });

  if (!upstream.ok) {
    const isUnauthorized = upstream.status === 401;
    return errorResponse({
      code: isUnauthorized ? "UNAUTHORIZED" : "UNKNOWN",
      message: "login failed",
      status: upstream.status,
      userMessage: isUnauthorized ? "邮箱或密码错误" : "登录失败，请稍后重试",
      retryable: !isUnauthorized,
    });
  }

  const data = await upstream.json();
  return NextResponse.json({
    ok: true,
    data: {
      jwt: data.access_token,
      userId: data.user_id,
      email: data.email,
      role: data.role,
    },
  });
}
