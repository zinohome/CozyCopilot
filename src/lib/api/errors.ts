export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * 20 normalized error codes covering network, HTTP, business, streaming, and
 * media-device failure modes. Codes are shared between the BFF boundary and
 * the client UI; a 5xx from upstream always becomes `UNKNOWN` here so the UI
 * can show a stable message regardless of which provider hiccuped.
 */
export type ErrorCode =
  | "NETWORK_OFFLINE"
  | "TIMEOUT"
  | "ABORTED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "PROVIDER_QUOTA_EXCEEDED"
  | "PROVIDER_UNAVAILABLE"
  | "PERSONALITY_NOT_FOUND"
  | "SESSION_CLOSED"
  | "VALIDATION_ERROR"
  | "INSUFFICIENT_BALANCE"
  | "PROVIDER_IN_USE"
  | "STREAM_INTERRUPTED"
  | "WS_DISCONNECTED"
  | "MIC_DENIED"
  | "MIC_UNSUPPORTED"
  | "LIVEKIT_FAILED"
  | "UNKNOWN";

export interface ErrorCodeMeta {
  status: number;
  userMessage: string;
  retryable: boolean;
  /**
   * Whether the UI should surface this error to the user. Internal codes like
   * `ABORTED` (user-initiated cancellation) set this to `false` so the toast
   * stays silent.
   */
  showToUser: boolean;
}

export const ERROR_CODES: Record<ErrorCode, ErrorCodeMeta> = {
  NETWORK_OFFLINE: { status: 0, userMessage: "网络连接中断", retryable: true, showToUser: true },
  TIMEOUT: { status: 0, userMessage: "请求超时，请重试", retryable: true, showToUser: true },
  ABORTED: { status: -1, userMessage: "", retryable: false, showToUser: false },
  UNAUTHORIZED: { status: 401, userMessage: "请重新登录", retryable: false, showToUser: true },
  FORBIDDEN: { status: 403, userMessage: "没有权限", retryable: false, showToUser: true },
  NOT_FOUND: { status: 404, userMessage: "资源不存在", retryable: false, showToUser: true },
  RATE_LIMITED: {
    status: 429,
    userMessage: "请求过于频繁，请稍后再试",
    retryable: true,
    showToUser: true,
  },
  PROVIDER_QUOTA_EXCEEDED: {
    status: 502,
    userMessage: "AI 服务商额度已用完",
    retryable: true,
    showToUser: true,
  },
  PROVIDER_UNAVAILABLE: {
    status: 502,
    userMessage: "AI 服务暂时不可用",
    retryable: true,
    showToUser: true,
  },
  PERSONALITY_NOT_FOUND: {
    status: 404,
    userMessage: "人格已删除，请重新选择",
    retryable: false,
    showToUser: true,
  },
  SESSION_CLOSED: { status: 400, userMessage: "会话已结束", retryable: false, showToUser: true },
  VALIDATION_ERROR: { status: 422, userMessage: "请求参数有误", retryable: false, showToUser: true },
  INSUFFICIENT_BALANCE: { status: 402, userMessage: "余额不足", retryable: false, showToUser: true },
  PROVIDER_IN_USE: {
    status: 409,
    userMessage: "此 provider 正在被引用，无法删除",
    retryable: false,
    showToUser: true,
  },
  STREAM_INTERRUPTED: {
    status: -1,
    userMessage: "生成中断，可点击重试",
    retryable: true,
    showToUser: true,
  },
  WS_DISCONNECTED: {
    status: -1,
    userMessage: "实时连接已断开，正在重连",
    retryable: true,
    showToUser: true,
  },
  MIC_DENIED: {
    status: -1,
    userMessage: "请在浏览器设置中允许麦克风权限",
    retryable: false,
    showToUser: true,
  },
  MIC_UNSUPPORTED: {
    status: -1,
    userMessage: "当前设备不支持录音",
    retryable: false,
    showToUser: true,
  },
  LIVEKIT_FAILED: {
    status: -1,
    userMessage: "语音通话连接失败，已切换到文字模式",
    retryable: false,
    showToUser: true,
  },
  UNKNOWN: {
    status: 500,
    userMessage: "出了点小问题，请稍后再试",
    retryable: true,
    showToUser: true,
  },
};

export interface NormalizedError {
  code: ErrorCode;
  /** Internal log message — never shown to the user. */
  message: string;
  /** Localized message safe to render in the UI. */
  userMessage: string;
  retryable: boolean;
}

/**
 * Map a CozyEngineV2 error response (status + JSON body) into a stable
 * `NormalizedError` envelope.
 *
 * Resolution order:
 *   1. If the body has a `code` field that matches a known `ErrorCode`, trust
 *      it (and honor any `userMessage`/`retryable` overrides the body provides).
 *   2. Otherwise, fall through to HTTP-status-based mapping. The status map is
 *      intentionally coarse: codes like `PERSONALITY_NOT_FOUND` and
 *      `SESSION_CLOSED` only flow through path (1) — the BFF is expected to
 *      echo the precise code in the body.
 */
export function normalize(status: number, body: unknown): NormalizedError {
  const bodyCode = (body as { code?: unknown })?.code;
  const bodyMessage = (body as { message?: unknown })?.message;
  const bodyUserMessage = (body as { userMessage?: unknown })?.userMessage;
  const bodyRetryable = (body as { retryable?: unknown })?.retryable;

  if (typeof bodyCode === "string" && bodyCode in ERROR_CODES) {
    const meta = ERROR_CODES[bodyCode as ErrorCode];
    return {
      code: bodyCode as ErrorCode,
      message: typeof bodyMessage === "string" ? bodyMessage : `HTTP ${status}`,
      userMessage: typeof bodyUserMessage === "string" ? bodyUserMessage : meta.userMessage,
      retryable: typeof bodyRetryable === "boolean" ? bodyRetryable : meta.retryable,
    };
  }

  // Status-based fallback
  const code = statusToCode(status);
  const meta = ERROR_CODES[code];
  return {
    code,
    message: typeof bodyMessage === "string" ? bodyMessage : `HTTP ${status}`,
    userMessage: typeof bodyUserMessage === "string" ? bodyUserMessage : meta.userMessage,
    retryable: typeof bodyRetryable === "boolean" ? bodyRetryable : meta.retryable,
  };
}

function statusToCode(status: number): ErrorCode {
  if (status === 0) return "NETWORK_OFFLINE";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 402) return "INSUFFICIENT_BALANCE";
  if (status === 404) return "NOT_FOUND"; // PERSONALITY_NOT_FOUND flows through body-code path
  if (status === 409) return "PROVIDER_IN_USE";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status === 400) return "UNKNOWN"; // SESSION_CLOSED flows through body-code path
  if (status === 502 || status === 503) return "PROVIDER_UNAVAILABLE";
  if (status >= 500) return "UNKNOWN";
  return "UNKNOWN";
}
