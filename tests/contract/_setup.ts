// Shared helpers for contract tests.
//
// Contract tests pin the BFF↔CozyEngineV2 wire format. They do this by:
//   1. Loading a JSON fixture (the recorded upstream response shape).
//   2. Mocking `global.fetch` to return that fixture when the BFF calls
//      CozyEngineV2.
//   3. Calling the BFF route handler directly (Option A from the task).
//   4. Asserting the outbound fetch URL/method/headers/body and the
//      inbound response shape.
//
// We intentionally use `vi.spyOn(global, "fetch")` instead of MSW because
// (a) it matches the existing per-route test style, (b) it gives us direct
// access to `mock.calls[0]` so we can assert against the outbound URL and
// RequestInit without fighting the MSW interceptor chain.

import { afterEach, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Standard BFF request helper. The route handlers are written for
 * `Request`; we accept a string URL and a Partial<RequestInit> to keep
 * the call sites short.
 */
export function makeReq(
  url: string,
  init: { method?: string; body?: string; auth?: string | null; contentType?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.contentType) headers["Content-Type"] = init.contentType;
  if (init.auth) headers.Authorization = init.auth;
  return new Request(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
  }) as unknown as NextRequest;
}

/**
 * Build a JSON Response from a plain object body. Mirrors the helper used by
 * the per-route unit tests; centralised here so contract tests stay small.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Install a `global.fetch` mock that returns a JSON Response.
 * Returns the spy so callers can inspect `mock.calls[0]` for outbound
 * assertions.
 */
export function installFetchMock(status: number, body: unknown) {
  return vi
    .spyOn(global, "fetch")
    .mockImplementation(
      (async () =>
        typeof body === "string"
          ? new Response(body, { status })
          : jsonResponse(body, status)) as typeof fetch,
    );
}

/**
 * Helper for route handlers that take a dynamic-segment `params` (the
 * `Promise<{ id: string }>` shape that Next.js 15 expects).
 */
export function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

/**
 * Standard beforeEach/afterEach pair for contract tests. Restores
 * `global.fetch` between tests so the upstream mock never leaks.
 */
export function useFetchMock() {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });
}
