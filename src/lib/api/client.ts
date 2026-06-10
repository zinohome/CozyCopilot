export interface ApiClientConfig {
  baseUrl: string;
  getToken: () => string | null;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiErrorBody;

export function createApiClient(config: ApiClientConfig) {
  async function get<T>(path: string): Promise<ApiResult<T>> {
    const token = config.getToken();
    const res = await fetch(`${config.baseUrl}${path}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    // BFF is supposed to always return an ApiResult-shaped JSON body, even on
    // 4xx/5xx. If the body is missing or not JSON (e.g. a load-balancer 502
    // HTML page), synthesize an UNKNOWN error so callers still get the
    // discriminated union contract they expect, not a thrown SyntaxError.
    if (!res.ok) {
      let body: unknown = null;
      try { body = await res.json(); } catch { /* non-JSON error body */ }
      return (
        (body && typeof body === "object" && "ok" in body && body.ok === false
          ? (body as ApiErrorBody)
          : {
              ok: false as const,
              error: {
                code: "UNKNOWN",
                message: `HTTP ${res.status}`,
                userMessage: "请求失败，请稍后重试",
                retryable: res.status >= 500,
              },
            })
      );
    }
    return res.json() as Promise<ApiResult<T>>;
  }

  return { get };
}
