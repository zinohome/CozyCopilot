import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth";
import * as apiFetchModule from "./apiFetch";
import { useSessions } from "./useSessions";

vi.mock("./apiFetch", () => ({
  apiFetch: vi.fn(),
}));
const apiFetchMock = apiFetchModule.apiFetch as unknown as ReturnType<typeof vi.fn>;

const sampleList = {
  sessions: [
    {
      id: "s-1",
      title: "Brainstorm",
      personality_id: "p-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      message_count: 4,
    },
  ],
};

describe("useSessions", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    useAuthStore.setState({ jwt: "test-jwt", userId: "u-1", email: "a@b.c", role: "user" });
  });

  afterEach(() => {
    useAuthStore.setState({ jwt: "", userId: "", email: "", role: "" });
  });

  it("initial state: loading true, items empty", async () => {
    apiFetchMock.mockResolvedValueOnce(sampleList);
    const { result } = renderHook(() => useSessions());
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("refresh() populates items on success", async () => {
    apiFetchMock.mockResolvedValueOnce(sampleList);
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([
      {
        id: "s-1",
        title: "Brainstorm",
        personalityId: "p-1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        messageCount: 4,
      },
    ]);
    expect(apiFetchMock).toHaveBeenCalledWith("/api/cozy/sessions", { token: "test-jwt" });
  });

  it("sets error state on fetch failure (e.g. 401)", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError("UNAUTHORIZED", "no token", false));
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.code).toBe("UNAUTHORIZED");
  });

  it("sets error state on network failure", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError("NETWORK_OFFLINE", "offline", true));
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.code).toBe("NETWORK_OFFLINE");
  });

  it("create() POSTs and refreshes", async () => {
    apiFetchMock
      .mockResolvedValueOnce(sampleList) // initial
      .mockResolvedValueOnce({
        id: "s-2",
        title: "New",
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-02-01T00:00:00Z",
      })
      .mockResolvedValueOnce({
        sessions: [sampleList.sessions[0], {
          id: "s-2",
          title: "New",
          created_at: "2026-02-01T00:00:00Z",
          updated_at: "2026-02-01T00:00:00Z",
        }],
      });

    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => {
      created = await result.current.create({ title: "New" });
    });

    expect(created.id).toBe("s-2");
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/api/cozy/sessions", {
      method: "POST",
      token: "test-jwt",
      body: { personality_id: undefined, title: "New" },
    });
  });

  it("rename() PATCHes and refreshes", async () => {
    apiFetchMock
      .mockResolvedValueOnce(sampleList)
      .mockResolvedValueOnce({ ...sampleList.sessions[0], title: "Renamed" })
      .mockResolvedValueOnce(sampleList);

    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.rename("s-1", "Renamed");
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/api/cozy/sessions/s-1", {
      method: "PATCH",
      token: "test-jwt",
      body: { title: "Renamed" },
    });
  });

  it("remove() DELETEs and refreshes", async () => {
    apiFetchMock
      .mockResolvedValueOnce(sampleList)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ sessions: [] });

    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove("s-1");
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/api/cozy/sessions/s-1", {
      method: "DELETE",
      token: "test-jwt",
    });
  });
});