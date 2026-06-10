import { NextResponse } from "next/server";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "invalid json",
          userMessage: "请输入有效的邮箱和密码",
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.message,
          userMessage: "请输入有效的邮箱和密码",
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (!upstream.ok) {
    const isUnauthorized = upstream.status === 401;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: isUnauthorized ? "UNAUTHORIZED" : "UNKNOWN",
          message: "login failed",
          userMessage: isUnauthorized ? "邮箱或密码错误" : "登录失败，请稍后重试",
          retryable: !isUnauthorized,
        },
      },
      { status: upstream.status },
    );
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
