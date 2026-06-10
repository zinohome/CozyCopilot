import { z } from "zod";

// M2.2 will narrow this to the 20-code ErrorCode union. Using `string` here
// keeps M2.1 unblocked and avoids a circular dependency with the spec.
export type BffErrorCode = string;

export interface BffErrorInit {
  code: BffErrorCode;
  message: string;
  status: number;
  userMessage?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

const DEFAULT_USER_MESSAGES: Record<number, string> = {
  400: "请求格式有误",
  401: "请重新登录",
  403: "没有权限",
  404: "资源不存在",
  409: "操作冲突",
  422: "请求参数有误",
  429: "请求过于频繁，请稍后再试",
  500: "服务出了点小问题，请稍后再试",
  502: "服务暂时不可用，请稍后重试",
  503: "服务暂时不可用，请稍后重试",
};

const FALLBACK_USER_MESSAGE = "出了点小问题，请稍后再试";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(init: BffErrorInit): Response {
  const userMessage =
    init.userMessage ?? DEFAULT_USER_MESSAGES[init.status] ?? FALLBACK_USER_MESSAGE;
  const retryable = init.retryable ?? init.status >= 500;
  const errorBody: Record<string, unknown> = {
    code: init.code,
    message: init.message,
    userMessage,
    retryable,
  };
  if (init.details) {
    errorBody.details = init.details;
  }
  return jsonResponse({ ok: false, error: errorBody }, init.status);
}

export function unauthorizedResponse(): Response {
  return errorResponse({
    code: "UNAUTHORIZED",
    message: "missing or invalid bearer token",
    status: 401,
  });
}

export function validationResponse(zodError: z.ZodError): Response {
  const details: Record<string, string> = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join(".") || "_root";
    details[key] = issue.message;
  }
  return errorResponse({
    code: "VALIDATION_ERROR",
    message: zodError.message,
    status: 400,
    userMessage: "请求参数有误",
    details,
  });
}

export function errorResponseFromUpstream(
  upstreamStatus: number,
  upstreamBody: unknown,
): Response {
  const body = upstreamBody as Record<string, unknown> | null | undefined;
  const bodyCode = body && typeof body.code === "string" ? body.code : undefined;
  const bodyMessage = body && typeof body.message === "string" ? body.message : undefined;
  const bodyUserMessage =
    body && typeof body.userMessage === "string" ? body.userMessage : undefined;
  const bodyRetryable =
    body && typeof body.retryable === "boolean" ? body.retryable : undefined;

  if (bodyCode && bodyCode.length > 0) {
    return errorResponse({
      code: bodyCode,
      message: bodyMessage ?? `upstream HTTP ${upstreamStatus}`,
      status: upstreamStatus,
      userMessage: bodyUserMessage,
      retryable: bodyRetryable,
    });
  }

  return errorResponse({
    code: statusToCode(upstreamStatus),
    message: `upstream HTTP ${upstreamStatus}`,
    status: upstreamStatus,
    retryable: isRetryableStatus(upstreamStatus),
  });
}

function statusToCode(status: number): BffErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "PROVIDER_IN_USE";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status === 402) return "INSUFFICIENT_BALANCE";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "UNKNOWN";
}

// Statuses that are conceptually retryable even though < 500. 429 means
// "back off and try again", and the only sane response is to retry.
const RETRYABLE_STATUSES = new Set<number>([429]);

function isRetryableStatus(status: number): boolean {
  return status >= 500 || RETRYABLE_STATUSES.has(status);
}

export function passThroughSSE(upstream: Response): Response {
  if (!upstream.ok || !upstream.body) {
    return errorResponse({
      code: "PROVIDER_UNAVAILABLE",
      message: `upstream HTTP ${upstream.status}`,
      status: 502,
    });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function parseJsonBody(
  req: Request,
  opts: { userMessage?: string } = {},
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    const body = await req.json();
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: errorResponse({
        code: "VALIDATION_ERROR",
        message: "invalid json",
        status: 400,
        userMessage: opts.userMessage,
      }),
    };
  }
}

export function validateBody<T>(
  body: unknown,
  schema: z.ZodType<T>,
  opts: { userMessage?: string } = {},
): { ok: true; data: T } | { ok: false; response: Response } {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    if (opts.userMessage) {
      // Caller wants a custom userMessage; rebuild the envelope so we keep
      // the field map but swap in the per-route text.
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_root";
        details[key] = issue.message;
      }
      return {
        ok: false,
        response: errorResponse({
          code: "VALIDATION_ERROR",
          message: parsed.error.message,
          status: 400,
          userMessage: opts.userMessage,
          details,
        }),
      };
    }
    return { ok: false, response: validationResponse(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}
