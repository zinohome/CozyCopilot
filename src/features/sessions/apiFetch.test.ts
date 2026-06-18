import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { apiFetch } from "./apiFetch";

const okEnvelope = <T,>(data: T) => ({ ok: true as const, data });
const errEnvelope = (code: string, message: string) => ({
  ok: false as const,
  error: { code, message, retryable: false },
});

describe("apiFetch (sessions)", () => {
  it("returns data on a 200 ok envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(okEnvelope({ id: "s1" }))),
    });
    vi.stubGlobal("fetch", fetchMock);
    const data = await apiFetch<{ id: string }>("/api/cozy/sessions", { token: "t" });
    expect(data).toEqual({ id: "s1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cozy/sessions",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer t" }),
      }),
    );
  });

  it("throws ApiError on an error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 400,
        text: () => Promise.resolve(JSON.stringify(errEnvelope("SESSION_CLOSED", "done"))),
      }),
    );
    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch("/x")).rejects.toMatchObject({ code: "SESSION_CLOSED" });
  });

  it("throws ApiError on a non-JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 502,
        text: () => Promise.resolve("<html>oops</html>"),
      }),
    );
    await expect(apiFetch("/x")).rejects.toMatchObject({ code: "UNKNOWN" });
  });

  it("serialises body to JSON for PATCH", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(okEnvelope({ id: "s1" }))),
    });
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/api/cozy/sessions/s1", {
      method: "PATCH",
      token: "t",
      body: { title: "Renamed" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cozy/sessions/s1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Renamed" }),
      }),
    );
  });

  it("omits Authorization when token is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(okEnvelope({}))),
    });
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/x");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});