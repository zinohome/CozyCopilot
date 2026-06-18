import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth";
import * as apiFetchModule from "./apiFetch";
import { usePersonalities } from "./usePersonalities";

vi.mock("./apiFetch", () => ({
  apiFetch: vi.fn(),
}));
const apiFetchMock = apiFetchModule.apiFetch as unknown as ReturnType<typeof vi.fn>;

const sampleList = {
  personalities: [
    {
      id: "p-1",
      name: "Coach",
      system_prompt: "You are a coach.",
      description: "Help me focus",
      model: "gpt-4o",
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

describe("usePersonalities", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    useAuthStore.setState({ jwt: "test-jwt", userId: "u-1", email: "a@b.c", role: "user" });
  });

  afterEach(() => {
    useAuthStore.setState({ jwt: "", userId: "", email: "", role: "" });
  });

  it("initial state: loading true, items empty", async () => {
    apiFetchMock.mockResolvedValueOnce(sampleList);
    const { result } = renderHook(() => usePersonalities());
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("refresh() populates items on success", async () => {
    apiFetchMock.mockResolvedValueOnce(sampleList);
    const { result } = renderHook(() => usePersonalities());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([
      {
        id: "p-1",
        name: "Coach",
        systemPrompt: "You are a coach.",
        description: "Help me focus",
        model: "gpt-4o",
        avatarUrl: undefined,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(result.current.error).toBeNull();
    expect(apiFetchMock).toHaveBeenCalledWith("/api/cozy/personalities", { token: "test-jwt" });
  });

  it("sets error state on fetch failure (e.g. 401)", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError("UNAUTHORIZED", "no token", false));
    const { result } = renderHook(() => usePersonalities());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.code).toBe("UNAUTHORIZED");
    expect(result.current.items).toEqual([]);
  });

  it("sets error state on network failure", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError("NETWORK_OFFLINE", "offline", true));
    const { result } = renderHook(() => usePersonalities());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.code).toBe("NETWORK_OFFLINE");
  });

  it("create() POSTs and refreshes", async () => {
    apiFetchMock
      .mockResolvedValueOnce(sampleList) // initial refresh
      .mockResolvedValueOnce({
        id: "p-2",
        name: "New",
        system_prompt: "you are new",
        created_at: "2026-02-01T00:00:00Z",
      })
      .mockResolvedValueOnce({
        personalities: [
          sampleList.personalities[0],
          {
            id: "p-2",
            name: "New",
            system_prompt: "you are new",
            created_at: "2026-02-01T00:00:00Z",
          },
        ],
      });

    const { result } = renderHook(() => usePersonalities());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => {
      created = await result.current.create({
        name: "New",
        systemPrompt: "you are new",
      });
    });

    expect(created.id).toBe("p-2");
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/cozy/personalities",
      expect.objectContaining({
        method: "POST",
        token: "test-jwt",
        body: expect.objectContaining({
          name: "New",
          system_prompt: "you are new",
        }),
      }),
    );
  });
});