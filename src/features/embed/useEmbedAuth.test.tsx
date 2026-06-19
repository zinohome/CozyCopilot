import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useEmbedAuth } from "./useEmbedAuth";
import { useAuthStore } from "@/stores/auth";

const VALID_KEY = "ck_" + "abcdef0123456789ABCDEF0123456789";

/**
 * Capture-friendly fetch stub. Returns a Response and exposes the
 * request body / AbortSignal through a `calls` array so individual
 * tests can assert without leaking across files.
 */
type CapturedCall = { url: string; init: RequestInit; signal: AbortSignal };
let captured: CapturedCall[] = [];

beforeEach(() => {
  captured = [];
  useAuthStore.setState({ jwt: "", userId: "", email: "", role: "" });
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function installFetch(status: number, body: unknown): void {
  vi.spyOn(global, "fetch").mockImplementation((async (input, init) => {
    captured.push({
      url: String(input),
      init: (init ?? {}) as RequestInit,
      // jsdom doesn't expose `signal` from init? on RequestInit typing,
      // but AbortSignal is on the wire. Cast through unknown.
      signal: ((init as unknown as { signal?: AbortSignal })?.signal) ?? new AbortController().signal,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch);
}

describe("useEmbedAuth", () => {
  it("starts in idle when key is null (no fetch issued)", async () => {
    const { result } = renderHook(() => useEmbedAuth(null));

    expect(result.current.status).toBe("idle");
    expect(result.current.jwt).toBeNull();
    expect(result.current.error).toBeNull();
    // Wait a microtask for any accidental fetches to land.
    await act(async () => {
      await Promise.resolve();
    });
    expect(captured).toHaveLength(0);
  });

  it("POSTs the key to /api/cozy/auth/embed-token on mount", async () => {
    installFetch(200, {
      ok: true,
      data: { jwt: "test-jwt", userId: "u-1", email: "e@x", role: "user" },
    });

    renderHook(() => useEmbedAuth(VALID_KEY));

    await waitFor(() => {
      expect(captured).toHaveLength(1);
    });

    expect(captured[0].url).toContain("/api/cozy/auth/embed-token");
    expect(captured[0].init.method).toBe("POST");
    expect(JSON.parse(captured[0].init.body as string)).toEqual({ key: VALID_KEY });
  });

  it("writes the JWT into useAuthStore on success and flips to authenticated", async () => {
    installFetch(200, {
      ok: true,
      data: {
        jwt: "embed-jwt-1",
        userId: "u-embed-1",
        email: "embed@x.com",
        role: "user",
      },
    });

    const { result } = renderHook(() => useEmbedAuth(VALID_KEY));

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });

    expect(result.current.jwt).toBe("embed-jwt-1");
    expect(useAuthStore.getState().jwt).toBe("embed-jwt-1");
    expect(useAuthStore.getState().userId).toBe("u-embed-1");
    expect(useAuthStore.getState().email).toBe("embed@x.com");
  });

  it("returns error state (with userMessage) when the upstream 401s", async () => {
    installFetch(401, {
      ok: false,
      error: { code: "UNAUTHORIZED", userMessage: "embed key 无效", retryable: false },
    });

    const { result } = renderHook(() => useEmbedAuth(VALID_KEY));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.jwt).toBeNull();
    expect(result.current.error).toEqual({
      code: "UNAUTHORIZED",
      userMessage: "embed key 无效",
    });
  });

  it("returns error state when the upstream 500s", async () => {
    installFetch(500, {
      ok: false,
      error: { code: "PROVIDER_UNAVAILABLE", userMessage: "认证失败，请稍后重试", retryable: true },
    });

    const { result } = renderHook(() => useEmbedAuth(VALID_KEY));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error?.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("returns error state when fetch itself throws", async () => {
    vi.spyOn(global, "fetch").mockImplementation((async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch);

    const { result } = renderHook(() => useEmbedAuth(VALID_KEY));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error?.code).toBe("NETWORK");
  });

  it("re-fetches when the key changes", async () => {
    installFetch(200, {
      ok: true,
      data: { jwt: "jwt-1", userId: "u-1", email: "e@x", role: "user" },
    });

    const { rerender } = renderHook(({ key }: { key: string | null }) => useEmbedAuth(key), {
      initialProps: { key: VALID_KEY as string | null },
    });

    await waitFor(() => {
      expect(captured).toHaveLength(1);
    });

    const newKey = "ck_" + "Z".repeat(32);
    rerender({ key: newKey });

    await waitFor(() => {
      expect(captured).toHaveLength(2);
    });
    expect(JSON.parse(captured[1].init.body as string)).toEqual({ key: newKey });
  });

  it("aborts in-flight fetch on unmount (no state flip after teardown)", async () => {
    let resolveFetch: (value: Response) => void = () => undefined;
    const spy = vi.spyOn(global, "fetch").mockImplementation(((input: unknown, init?: unknown) => {
      // Push BEFORE awaiting so the assertion below sees the call.
      captured.push({
        url: String(input),
        init: (init ?? {}) as RequestInit,
        signal: ((init as { signal?: AbortSignal } | undefined)?.signal) ?? new AbortController().signal,
      });
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
        const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
        signal?.addEventListener("abort", () => {
          resolve(new Response("", { status: 499 }));
        });
      });
    }) as typeof fetch);

    const { result, unmount } = renderHook(() => useEmbedAuth(VALID_KEY));

    // Drain effects and the synchronous fetch prelude. The hook's
    // `useEffect` schedules the fetch synchronously inside an async
    // IIFE; the IIFE invokes `fetch(...)` before yielding at the
    // first await. Wait one microtask + flush pending react work so
    // the spy has been called.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(captured.length).toBeGreaterThanOrEqual(1);
    const signal = captured[0].signal;
    expect(signal.aborted).toBe(false);

    unmount();
    expect(signal.aborted).toBe(true);

    // Resolve the dangling fetch so vitest doesn't warn about an
    // outstanding promise. The hook is unmounted so no state flips.
    resolveFetch(new Response(JSON.stringify({ ok: true, data: { jwt: "x" } })));
    // Drain any post-unmount work so the abort propagation settles.
    await act(async () => {
      await Promise.resolve();
    });
    // `result` is referenced above so the linter doesn't strip it;
    // the variable is only kept for the act/unmount interaction.
    void result;
  });
});
