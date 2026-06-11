// Contract test: chat route group.
//
// Pins the wire format for the chat BFF routes against CozyEngineV2.
// The /v1/chat/completions SSE case is special — it uses
// passThroughSSE which streams the response body verbatim. We assert on
// the SSE content-type and that the body passes through, not on
// chunk-by-chunk semantics.
//
// The /v1/voice/chat multipart case is intentionally SKIPPED here.
// Multipart bodies cannot be represented in a JSON fixture, and the
// existing unit test at app/api/cozy/chat/voice/route.test.ts already
// covers the multipart path with a real FormData body. A contract
// test for it would not add confidence without a much more elaborate
// fixture format (field list + audio bytes) and a way to compare
// FormData objects by field.

import { describe, expect, it } from "vitest";
import asyncFixture from "./fixtures/chat.async.json";
import voiceTokenFixture from "./fixtures/chat.voice-token.json";
import voiceSummaryFixture from "./fixtures/chat.voice-summary.json";
import voiceContextFixture from "./fixtures/chat.voice-context.json";
import sseFixture from "./fixtures/chat.completions.sse.json";
import { POST as chatPost } from "@app/api/cozy/chat/route";
import { POST as asyncPost } from "@app/api/cozy/chat/async/route";
import { POST as voiceTokenPost } from "@app/api/cozy/chat/voice-token/route";
import { POST as voiceSummaryPost } from "@app/api/cozy/chat/voice-summary/route";
import { POST as voiceContextPost } from "@app/api/cozy/chat/voice-context/route";
import { installFetchMock, makeReq, useFetchMock } from "./_setup";

const BEARER = "Bearer test-jwt";

describe("contract: POST /api/cozy/chat (SSE passthrough)", () => {
  useFetchMock();

  it("forwards to /v1/chat/completions with Bearer JWT and streams SSE bytes", async () => {
    // Special-case: SSE upstream response is text/event-stream with a
    // plain string body (not JSON).
    const mock = installFetchMock(200, sseFixture.upstreamResponse.body);

    const req = makeReq("http://localhost/api/cozy/chat", {
      method: "POST",
      contentType: "application/json",
      auth: BEARER,
      body: JSON.stringify(sseFixture.upstreamRequest.body),
    });
    const res = await chatPost(req);

    // Outbound assertions
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(sseFixture.upstreamRequest.pathname);
    expect(init.method).toBe(sseFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(JSON.parse(init.body as string)).toEqual(sseFixture.upstreamRequest.body);

    // Inbound assertions: SSE passthrough — assert on Content-Type and
    // that the body is a ReadableStream. The string body is forwarded
    // verbatim, so a substring check is the next-best signal.
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(sseFixture.expectedResponse["Content-Type"]);
    expect(res.body).toBeInstanceOf(ReadableStream);
    const text = await res.text();
    expect(text).toContain(sseFixture.expectedResponse.bodyContains);
  });
});

describe("contract: POST /api/cozy/chat/async", () => {
  useFetchMock();

  it("forwards to /v1/chat/async with Bearer JWT and returns task envelope", async () => {
    const mock = installFetchMock(
      asyncFixture.upstreamResponse.status,
      asyncFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/chat/async", {
      method: "POST",
      contentType: "application/json",
      auth: BEARER,
      body: JSON.stringify(asyncFixture.upstreamRequest.body),
    });
    const res = await asyncPost(req);
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(asyncFixture.upstreamRequest.pathname);
    expect(init.method).toBe(asyncFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(JSON.parse(init.body as string)).toEqual(asyncFixture.upstreamRequest.body);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: asyncFixture.expectedResponse });
  });
});

describe("contract: POST /api/cozy/chat/voice-token", () => {
  useFetchMock();

  it("forwards to /v1/voice/token with Bearer JWT and returns LiveKit token envelope", async () => {
    const mock = installFetchMock(
      voiceTokenFixture.upstreamResponse.status,
      voiceTokenFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/chat/voice-token", {
      method: "POST",
      contentType: "application/json",
      auth: BEARER,
      body: JSON.stringify(voiceTokenFixture.upstreamRequest.body),
    });
    const res = await voiceTokenPost(req);
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(voiceTokenFixture.upstreamRequest.pathname);
    expect(init.method).toBe(voiceTokenFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(JSON.parse(init.body as string)).toEqual(voiceTokenFixture.upstreamRequest.body);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: voiceTokenFixture.expectedResponse });
  });
});

describe("contract: POST /api/cozy/chat/voice-summary", () => {
  useFetchMock();

  it("forwards to /v1/chat/voice_summary with Bearer JWT and returns saved_message_ids", async () => {
    const mock = installFetchMock(
      voiceSummaryFixture.upstreamResponse.status,
      voiceSummaryFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/chat/voice-summary", {
      method: "POST",
      contentType: "application/json",
      auth: BEARER,
      body: JSON.stringify(voiceSummaryFixture.upstreamRequest.body),
    });
    const res = await voiceSummaryPost(req);
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(voiceSummaryFixture.upstreamRequest.pathname);
    expect(init.method).toBe(voiceSummaryFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(JSON.parse(init.body as string)).toEqual(voiceSummaryFixture.upstreamRequest.body);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: voiceSummaryFixture.expectedResponse });
  });
});

describe("contract: POST /api/cozy/chat/voice-context", () => {
  useFetchMock();

  it("forwards to /v1/chat/voice_context with Bearer JWT and returns context array", async () => {
    const mock = installFetchMock(
      voiceContextFixture.upstreamResponse.status,
      voiceContextFixture.upstreamResponse.body,
    );

    const req = makeReq("http://localhost/api/cozy/chat/voice-context", {
      method: "POST",
      contentType: "application/json",
      auth: BEARER,
      body: JSON.stringify(voiceContextFixture.upstreamRequest.body),
    });
    const res = await voiceContextPost(req);
    const body = await res.json();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain(voiceContextFixture.upstreamRequest.pathname);
    expect(init.method).toBe(voiceContextFixture.upstreamRequest.method);
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    expect(JSON.parse(init.body as string)).toEqual(voiceContextFixture.upstreamRequest.body);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: voiceContextFixture.expectedResponse });
  });
});

describe("contract: POST /api/cozy/chat/voice (multipart — SKIPPED)", () => {
  // See file header for the rationale. The existing unit test
  // app/api/cozy/chat/voice/route.test.ts covers the multipart path.
  it("is covered by the unit test at app/api/cozy/chat/voice/route.test.ts", () => {
    expect(true).toBe(true);
  });
});
