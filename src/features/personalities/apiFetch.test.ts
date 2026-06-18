import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { apiFetch } from "./apiFetch";

const okEnvelope = <T,>(data: T) => ({ ok: true as const, data });
const errEnvelope = (code: string, message: string, retryable = false) => ({
  ok: false as const,
  error: { code, message, retryable },
});

describe("apiFetch (personalities)", () => {
  it("returns data on a 200 ok envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(okEnvelope({ id: "p1" }))),
    });
    vi.stubGlobal("fetch", fetchMock);
    const data = await apiFetch<{ id: string }>("/api/cozy/personalities", { token: "t" });
    expect(data).toEqual({ id: "p1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cozy/personalities",
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
        status: 404,
        text: () => Promise.resolve(JSON.stringify(errEnvelope("NOT_FOUND", "missing", false))),
      }),
    );
    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch("/x")).rejects.toMatchObject({ code: "NOT_FOUND" });
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

  it("serialises body to JSON and sets Content-Type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(okEnvelope({ id: "p2" }))),
    });
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/api/cozy/personalities", {
      method: "POST",
      token: "t",
      body: { name: "n" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cozy/personalities",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "n" }),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
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