// M4.7 — End-to-end BFF integration test.
//
// Wires four M4 surfaces into one happy-path session:
//   1. Chat with ToolCall SSE passthrough
//   2. Async task creation + polling fallback
//   3. File upload (multipart)
//   4. Custom provider CRUD (POST -> GET list -> DELETE)
//
// All four mock the BFF↔CozyEngineV2 boundary with
// `vi.spyOn(global, "fetch")` — the same pattern the per-route
// contract tests use (see tests/contract/_setup.ts). We do NOT
// use MSW because we are calling Next.js API route handlers
// directly in Node, where MSW's request interceptor is not
// engaged. The "integration" is at the BFF boundary, not the
// browser boundary.
//
// The chat SSE body is a real `ReadableStream` from
// `node:stream/web` so the route's `passThroughSSE` plumbing is
// exercised end-to-end (the route's response.body is itself a
// ReadableStream, and we consume it to assert the raw SSE bytes
// the client would receive).
//
// The multipart upload is hand-rolled as a real multipart/form-data
// body (boundary + Content-Disposition + bytes). We can't go through
// FormData + Request.formData() in this jsdom+vitest environment:
// jsdom's Blob polyfill loses bytes when round-tripped via undici's
// FormData serializer, so the BFF's `req.formData()` returns a
// Blob with `size: 0` and the route 400s with EMPTY_FILE. The
// hand-rolled body bypasses the polyfill and lets the BFF's
// native `req.formData()` parse the bytes normally.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ReadableStream } from "node:stream/web";
// jsdom (vitest's default env) ships a Request/FormData polyfill that
// does not implement multipart parsing. We use undici's real Request
// (Node 18+ ships undici in-process) so `req.formData()` works inside
// the BFF route handlers. The voice multipart test
// (app/api/cozy/chat/voice/route.test.ts) uses the same undici import.
import { Request as UndiciRequest } from "undici";
import { POST as chatPost } from "@app/api/cozy/chat/route";
import { POST as asyncPost, GET as asyncGet } from "@app/api/cozy/chat/async/route";
import { POST as uploadPost } from "@app/api/cozy/upload/route";
import { GET as providersList, POST as providersCreate } from "@app/api/cozy/providers/route";
import { DELETE as providerDelete } from "@app/api/cozy/providers/[id]/route";
import { routeParams } from "../contract/_setup";

const BEARER = "Bearer test-jwt";
const SESSION_ID = "00000000-0000-0000-0000-000000000001";
const PERSONALITY_ID = "00000000-0000-0000-0000-000000000002";
const PROVIDER_ID = "66666666-6666-4666-8666-666666666601";

describe("M4 end-to-end BFF integration", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("chat: streams delta + tool_call + done SSE events in order", async () => {
    // Build a real ReadableStream that emits the three SSE events.
    // Each `enqueue` is one full SSE record (event + data + blank line).
    const encoder = new TextEncoder();
    const sseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('event: delta\ndata: {"type":"delta","content":"hi "}\n\n'),
        );
        controller.enqueue(
          encoder.encode(
            'event: tool_call\ndata: {"type":"tool_call","id":"tc-1","name":"search","arguments":{"q":"weather"}}\n\n',
          ),
        );
        controller.enqueue(encoder.encode('event: done\ndata: {"type":"done"}\n\n'));
        controller.close();
      },
    });

    // `ReadableStream` from `node:stream/web` is structurally compatible
    // with the DOM `ReadableStream` used by `Response`'s BodyInit at
    // runtime, but TypeScript treats them as distinct generics
    // (different ArrayBufferLike shapes). We cast to `BodyInit` to
    // bridge the two — the runtime contract is identical.
    const mock = vi
      .spyOn(global, "fetch")
      .mockImplementation(
        (async () =>
          new Response(sseStream as unknown as BodyInit, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          })) as unknown as typeof fetch,
      );

    const req = new Request("http://localhost/api/cozy/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: BEARER },
      body: JSON.stringify({
        session_id: SESSION_ID,
        personality_id: PERSONALITY_ID,
        message: "what's the weather?",
      }),
    });

    const res = await chatPost(req as unknown as Parameters<typeof chatPost>[0]);

    // Outbound: BFF called upstream with the validated body and Bearer JWT.
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain("/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);

    // Inbound: SSE passthrough headers + body.
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.body).toBeInstanceOf(ReadableStream);

    const text = await res.text();
    expect(text).toContain('event: delta');
    expect(text).toContain('"content":"hi "');
    expect(text).toContain('event: tool_call');
    expect(text).toContain('"name":"search"');
    expect(text).toContain('event: done');

    // Order check: the delta event must appear before the tool_call event,
    // and the tool_call event must appear before the done event.
    const deltaAt = text.indexOf("event: delta");
    const toolAt = text.indexOf("event: tool_call");
    const doneAt = text.indexOf("event: done");
    expect(deltaAt).toBeGreaterThanOrEqual(0);
    expect(toolAt).toBeGreaterThan(deltaAt);
    expect(doneAt).toBeGreaterThan(toolAt);
  });

  it("async: creates a task then polls it to completion", async () => {
    // First call: POST /v1/chat/async returns the task envelope.
    // Second call: GET  /v1/chat/async/{id} returns the completed status.
    const taskId = "task-abc-123";
    const mock = vi
      .spyOn(global, "fetch")
      .mockImplementation(
        (async (input: unknown) => {
          const url = String(input);
          if (url.endsWith("/v1/chat/async")) {
            return new Response(JSON.stringify({ task_id: taskId, status: "pending" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (url.includes(`/v1/chat/async/${taskId}`)) {
            return new Response(
              JSON.stringify({ task_id: taskId, status: "completed", result: "ok" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response("not found", { status: 404 });
        }) as unknown as typeof fetch,
      );

    // 1) Create
    const createReq = new Request("http://localhost/api/cozy/chat/async", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: BEARER },
      body: JSON.stringify({
        session_id: SESSION_ID,
        personality_id: PERSONALITY_ID,
        message: "background this",
      }),
    });
    const createRes = await asyncPost(createReq as unknown as Parameters<typeof asyncPost>[0]);
    const createBody = await createRes.json();
    expect(createRes.status).toBe(200);
    expect(createBody).toEqual({ ok: true, data: { task_id: taskId, status: "pending" } });

    // 2) Poll
    const pollReq = new Request(
      `http://localhost/api/cozy/chat/async?taskId=${encodeURIComponent(taskId)}`,
      { method: "GET", headers: { Authorization: BEARER } },
    );
    const pollRes = await asyncGet(pollReq as unknown as Parameters<typeof asyncGet>[0]);
    const pollBody = await pollRes.json();
    expect(pollRes.status).toBe(200);
    expect(pollBody).toEqual({ task_id: taskId, status: "completed", result: "ok" });

    // Outbound: both calls hit upstream.
    expect(mock).toHaveBeenCalledTimes(2);
    const [createUrl, createInit] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(createUrl)).toContain("/v1/chat/async");
    expect(createInit.method).toBe("POST");
    const [pollUrl, pollInit] = mock.mock.calls[1] as [unknown, RequestInit];
    expect(String(pollUrl)).toContain(`/v1/chat/async/${taskId}`);
    expect(pollInit.method).toBe("GET");
  });

  it("upload: forwards multipart to /v1/upload and unwraps the envelope", async () => {
    const mock = vi.spyOn(global, "fetch").mockImplementation(
      (async () =>
        new Response(
          JSON.stringify({
            url: "https://cdn.example.com/x.png",
            filename: "x.png",
            size: 1024,
            mime: "image/png",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as unknown as typeof fetch,
    );

    // Build a real multipart/form-data body manually. We can't use
    // undici's FormData + Node Blob round-trip directly: undici's
    // FormData serializes Blob via stream inspection, but jsdom's
    // `Request.formData()` returns a Blob with `size: 0` because
    // the jsdom Blob doesn't expose the real underlying bytes
    // (the BFF then 400s with EMPTY_FILE). Hand-rolling the
    // multipart body — boundary + headers + bytes — sidesteps the
    // polyfill while keeping the bytes, MIME type, and filename
    // intact for the BFF to parse.
    const boundary = "----CozyTestMultipartBoundary7c9f3a";
    const fileBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="sessionId"\r\n\r\n` +
      `${SESSION_ID}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="personalityId"\r\n\r\n` +
      `${PERSONALITY_ID}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="x.png"\r\n` +
      `Content-Type: image/png\r\n\r\n` +
      `${new TextDecoder("latin1").decode(fileBytes)}\r\n` +
      `--${boundary}--\r\n`;

    const req = new UndiciRequest("http://localhost/api/cozy/upload", {
      method: "POST",
      headers: {
        Authorization: BEARER,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    const res = await uploadPost(req as unknown as Parameters<typeof uploadPost>[0]);
    const body = await res.json();

    // If the BFF returned an error envelope, surface it so we don't
    // chase a "fetch not called" symptom whose root cause is upstream.
    if (res.status !== 200) {
      throw new Error(`upload BFF returned ${res.status}: ${JSON.stringify(body)}`);
    }

    // Outbound: BFF called /v1/upload with Bearer JWT. Body is FormData,
    // so we assert on the form fields rather than the body string.
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(url)).toContain("/v1/upload");
    expect((init.headers as Record<string, string>).Authorization).toBe(BEARER);
    // The BFF forwards the FormData it parsed; in tests it's undici's
    // FormData (the polyfill), not the global one. We duck-type it
    // instead of relying on instanceof.
    const sentForm = init.body as { get: (k: string) => unknown };
    expect(typeof sentForm.get).toBe("function");
    expect(sentForm.get("session_id")).toBe(SESSION_ID);
    expect(sentForm.get("personality_id")).toBe(PERSONALITY_ID);
    const sentFile = sentForm.get("file");
    expect(sentFile).toBeTruthy();
    expect((sentFile as { type: string }).type).toBe("image/png");

    // Inbound: success envelope unwrapped.
    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      data: {
        url: "https://cdn.example.com/x.png",
        filename: "x.png",
        size: 1024,
        mime: "image/png",
      },
    });
  });

  it("providers: POST -> GET list -> DELETE; api_key never appears in GET", async () => {
    // Per-call upstream shapes. The list mock deliberately omits any
    // api_key field — the BFF must not synthesize one.
    const created = {
      id: PROVIDER_ID,
      base_url: "https://api.example.com/v1",
      model: "gpt-test",
      label: "My Test Provider",
      created_at: "2026-06-17T00:00:00Z",
    };
    const list = { providers: [created] };
    const deleted = { id: PROVIDER_ID, deleted: true };

    const mock = vi
      .spyOn(global, "fetch")
      .mockImplementation(
        (async (input: unknown, init?: RequestInit) => {
          const url = String(input);
          const method = (init?.method ?? "GET").toUpperCase();
          if (url.includes(`/v1/users/me/providers/${PROVIDER_ID}`) && method === "DELETE") {
            return new Response(JSON.stringify(deleted), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (url.includes(`/v1/users/me/providers/${PROVIDER_ID}`) && method === "GET") {
            return new Response(JSON.stringify(created), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (url.endsWith("/v1/users/me/providers") && method === "POST") {
            return new Response(JSON.stringify(created), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (url.endsWith("/v1/users/me/providers") && method === "GET") {
            return new Response(JSON.stringify(list), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response("not found", { status: 404 });
        }) as unknown as typeof fetch,
      );

    // 1) POST a provider.
    const createReq = new Request("http://localhost/api/cozy/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: BEARER },
      body: JSON.stringify({
        label: "My Test Provider",
        base_url: "https://api.example.com/v1",
        api_key: "sk-test-secret-DO-NOT-LEAK",
        model: "gpt-test",
      }),
    });
    const createRes = await providersCreate(
      createReq as unknown as Parameters<typeof providersCreate>[0],
    );
    const createBody = await createRes.json();
    expect(createRes.status).toBe(200);
    expect(createBody).toEqual({ ok: true, data: created });
    // Outbound: api_key is forwarded to upstream (BFF doesn't strip it on POST).
    const [createUrl, createInit] = mock.mock.calls[0] as [unknown, RequestInit];
    expect(String(createUrl)).toContain("/v1/users/me/providers");
    expect(createInit.method).toBe("POST");
    const sentBody = JSON.parse(createInit.body as string);
    expect(sentBody.api_key).toBe("sk-test-secret-DO-NOT-LEAK");

    // 2) GET the list.
    const listReq = new Request("http://localhost/api/cozy/providers", {
      method: "GET",
      headers: { Authorization: BEARER },
    });
    const listRes = await providersList(listReq as unknown as Parameters<typeof providersList>[0]);
    const listBody = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listBody).toEqual({ ok: true, data: list });

    // Pin the load-bearing contract: api_key MUST NOT appear anywhere in the
    // GET response. The list itself has no api_key field, but the BFF must
    // also not synthesize one. We assert by JSON.stringify round-trip.
    const listSerialized = JSON.stringify(listBody);
    expect(listSerialized).not.toContain("api_key");
    expect(listSerialized).not.toContain("sk-test-secret-DO-NOT-LEAK");

    // 3) DELETE the provider.
    const deleteReq = new Request(`http://localhost/api/cozy/providers/${PROVIDER_ID}`, {
      method: "DELETE",
      headers: { Authorization: BEARER },
    });
    const deleteRes = await providerDelete(
      deleteReq as unknown as Parameters<typeof providerDelete>[0],
      routeParams({ id: PROVIDER_ID }),
    );
    const deleteBody = await deleteRes.json();
    expect(deleteRes.status).toBe(200);
    expect(deleteBody).toEqual({ ok: true, data: deleted });

    // Outbound: DELETE hit upstream with the right path and Bearer JWT.
    const [deleteUrl, deleteInit] = mock.mock.calls[2] as [unknown, RequestInit];
    expect(String(deleteUrl)).toContain(`/v1/users/me/providers/${PROVIDER_ID}`);
    expect(deleteInit.method).toBe("DELETE");
    expect((deleteInit.headers as Record<string, string>).Authorization).toBe(BEARER);

    // Sanity: 3 upstream calls (POST, GET, DELETE).
    expect(mock).toHaveBeenCalledTimes(3);
  });
});
