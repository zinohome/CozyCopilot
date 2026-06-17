import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth";
import * as apiFetchModule from "./apiFetch";
import { useProviders } from "./useProviders";

// Mock the apiFetch module so the hook never hits the real network.
vi.mock("./apiFetch", () => ({
  apiFetch: vi.fn(),
}));
const apiFetchMock = apiFetchModule.apiFetch as unknown as ReturnType<typeof vi.fn>;

const sampleList = {
  providers: [
    {
      id: "pr-1",
      base_url: "https://api.openai.com/v1",
      model: "gpt-4o",
      label: "OpenAI",
      is_default: true,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

describe("useProviders", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    useAuthStore.setState({ jwt: "test-jwt", userId: "u-1", email: "a@b.c", role: "user" });
  });

  afterEach(() => {
    useAuthStore.setState({ jwt: "", userId: "", email: "", role: "" });
  });

  it("initial state: loading true, providers empty", async () => {
    apiFetchMock.mockResolvedValueOnce(sampleList);
    const { result } = renderHook(() => useProviders());
    expect(result.current.loading).toBe(true);
    expect(result.current.providers).toEqual([]);
    // settle
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("refresh() populates providers on success", async () => {
    apiFetchMock.mockResolvedValueOnce(sampleList);
    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.providers).toEqual([
      {
        id: "pr-1",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
        label: "OpenAI",
        isDefault: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(result.current.error).toBeNull();
    expect(apiFetchMock).toHaveBeenCalledWith("/api/cozy/providers", { token: "test-jwt" });
  });

  it("sets error state on fetch failure", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError("UNKNOWN", "boom", true));
    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.message).toBe("boom");
    expect(result.current.providers).toEqual([]);
  });

  it("create() POSTs and refreshes", async () => {
    apiFetchMock
      .mockResolvedValueOnce(sampleList) // initial refresh
      .mockResolvedValueOnce({
        // create response
        id: "pr-2",
        base_url: "https://x/v1",
        model: "gpt-4o-mini",
        label: "Mini",
        is_default: false,
        created_at: "2026-02-01T00:00:00Z",
      })
      .mockResolvedValueOnce({
        providers: [
          sampleList.providers[0],
          {
            id: "pr-2",
            base_url: "https://x/v1",
            model: "gpt-4o-mini",
            label: "Mini",
            is_default: false,
            created_at: "2026-02-01T00:00:00Z",
          },
        ],
      });

    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => {
      created = await result.current.create({
        baseUrl: "https://x/v1",
        apiKey: "sk-xxx",
        model: "gpt-4o-mini",
        label: "Mini",
      });
    });

    expect(created.id).toBe("pr-2");
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/api/cozy/providers", {
      method: "POST",
      token: "test-jwt",
      body: {
        base_url: "https://x/v1",
        api_key: "sk-xxx",
        model: "gpt-4o-mini",
        label: "Mini",
        is_default: undefined,
      },
    });
    // refresh was called (3rd call)
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
  });

  it("update() PATCHes and refreshes", async () => {
    apiFetchMock
      .mockResolvedValueOnce(sampleList)
      .mockResolvedValueOnce({ ...sampleList.providers[0], label: "renamed" })
      .mockResolvedValueOnce(sampleList);

    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.update("pr-1", { label: "renamed" });
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/api/cozy/providers/pr-1", {
      method: "PATCH",
      token: "test-jwt",
      body: { label: "renamed" },
    });
  });

  it("remove() DELETEs and refreshes", async () => {
    apiFetchMock.mockResolvedValueOnce(sampleList).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ providers: [] });

    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove("pr-1");
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/api/cozy/providers/pr-1", {
      method: "DELETE",
      token: "test-jwt",
    });
  });

  it("test() returns the structured result as-is for an ok:true upstream body", async () => {
    apiFetchMock.mockResolvedValueOnce(sampleList).mockResolvedValueOnce({
      ok: true,
      latency_ms: 123,
      models: ["gpt-4o", "gpt-4o-mini"],
    });

    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res!: Awaited<ReturnType<typeof result.current.test>>;
    await act(async () => {
      res = await result.current.test({
        baseUrl: "https://x/v1",
        apiKey: "sk-xxx",
        model: "gpt-4o",
      });
    });

    expect(res).toEqual({
      ok: true,
      latencyMs: 123,
      models: ["gpt-4o", "gpt-4o-mini"],
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/api/cozy/providers/test", {
      method: "POST",
      token: "test-jwt",
      body: {
        base_url: "https://x/v1",
        api_key: "sk-xxx",
        model: "gpt-4o",
        is_default: undefined,
      },
    });
  });

  it("test() returns the structured result for an ok:false upstream body without throwing", async () => {
    apiFetchMock.mockResolvedValueOnce(sampleList).mockResolvedValueOnce({
      ok: false,
      latency_ms: 0,
      error: { code: "INVALID_API_KEY", message: "key rejected" },
    });

    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res!: Awaited<ReturnType<typeof result.current.test>>;
    await act(async () => {
      res = await result.current.test({
        baseUrl: "https://x/v1",
        apiKey: "sk-bad",
        model: "gpt-4o",
      });
    });

    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("INVALID_API_KEY");
    expect(res.error?.message).toBe("key rejected");
    expect(res.latencyMs).toBe(0);
  });
});
