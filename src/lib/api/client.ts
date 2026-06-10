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
    return res.json() as Promise<ApiResult<T>>;
  }

  return { get };
}
