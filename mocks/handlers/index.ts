import { http, HttpResponse } from "msw";

// Minimal handler set for M1. Extended in M2.
export const handlers = [
  http.get("/api/cozy/health", () => HttpResponse.json({ ok: true, data: { status: "ok" } })),
];
