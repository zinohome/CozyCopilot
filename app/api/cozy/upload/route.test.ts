import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Request as UndiciRequest, FormData as UndiciFormData } from "undici";
import { POST } from "./route";

const SESSION_ID = "sess-1";
const PERSONALITY_ID = "pers-1";
const BEARER = "Bearer test-jwt";

// jsdom (vitest's default env) installs a broken Request/FormData polyfill
// that doesn't support multipart parsing — `req.formData()` on a Request
// built from FormData throws "Content-Type was not one of multipart/
// form-data". We import the real undici implementations to construct test
// Requests the route can actually parse. Node 18+ provides a working global
// Blob, so we use that directly.
//
// Additionally, jsdom's Request body serializer caps the embedded payload at
// a few hundred bytes regardless of the source Blob's size — so a 21MB blob
// roundtrips as size=0 inside the route. We work around that by overriding
// `req.formData()` to return a custom FormData with a fake file whose
// `size` we control directly. The auth + body-type plumbing still goes
// through the real undici Request so the route's `req.formData()` and
// `req.headers.get("Authorization")` paths stay realistic.
function makeMultipartRequest(
  fields: Record<string, string | Blob>,
  auth: string | null = BEARER,
  fileOverrides: { size?: number; type?: string } = {},
): NextRequest {
  // Default `size` to 8 so a non-empty payload clears the EMPTY_FILE check
  // when the test doesn't care about size validation. Pass 0 to specifically
  // exercise the empty-file branch.
  const effectiveOverrides = { size: 8, ...fileOverrides };
  const form = new UndiciFormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;
  const req = new UndiciRequest("http://localhost/api/cozy/upload", {
    method: "POST",
    headers,
    body: form,
  }) as unknown as NextRequest;
  // Patch formData() to return a FormData with a properly-sized file. The
  // undici parse of the real body zero-sizes the Blob; the route only needs
  // to see the field names + a Blob with the right `size` and `type`.
  const originalFormData = req.formData.bind(req);
  req.formData = async () => {
    const realForm = await originalFormData();
    const fakedForm = new globalThis.FormData();
    for (const [k, v] of realForm.entries()) {
      if (v instanceof Blob && effectiveOverrides.size != null) {
        Object.defineProperty(v, "size", { value: effectiveOverrides.size, configurable: true });
      }
      fakedForm.set(k, v);
    }
    return fakedForm;
  };
  return req;
}

function makeFakeFile(opts: { size?: number; type?: string; name?: string } = {}): Blob {
  const size = opts.size ?? 8;
  const bytes = new Uint8Array(size).fill(1);
  return new globalThis.Blob([bytes], { type: opts.type ?? "image/png" });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchMock(status: number, body: unknown) {
  return vi
    .spyOn(global, "fetch")
    .mockImplementation((async () =>
      typeof body === "string" ? new Response(body, { status }) : jsonResponse(body, status)) as typeof fetch);
}

describe("POST /api/cozy/upload (multipart)", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejects missing Authorization header with 401 UNAUTHORIZED", async () => {
    const res = await POST(
      makeMultipartRequest(
        {
          sessionId: SESSION_ID,
          personalityId: PERSONALITY_ID,
          file: makeFakeFile(),
        },
        null,
      ),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 MISSING_FILE when 'file' field is absent", async () => {
    const res = await POST(
      makeMultipartRequest({
        sessionId: SESSION_ID,
        personalityId: PERSONALITY_ID,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("MISSING_FILE");
  });

  it("returns 400 VALIDATION_ERROR when sessionId is missing", async () => {
    const res = await POST(
      makeMultipartRequest({
        personalityId: PERSONALITY_ID,
        file: makeFakeFile(),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 413 FILE_TOO_LARGE when file exceeds the limit", async () => {
    // jsdom's Request body serializer caps the embedded payload at a few
    // hundred bytes regardless of the source Blob's size, so we override the
    // resulting file's `size` to 21MB. The route's 20MB cap then trips.
    const res = await POST(
      makeMultipartRequest(
        {
          sessionId: SESSION_ID,
          personalityId: PERSONALITY_ID,
          file: makeFakeFile(),
        },
        BEARER,
        { size: 21 * 1024 * 1024 },
      ),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("returns 415 UNSUPPORTED_MEDIA_TYPE for disallowed MIME types", async () => {
    const res = await POST(
      makeMultipartRequest({
        sessionId: SESSION_ID,
        personalityId: PERSONALITY_ID,
        file: makeFakeFile({ type: "application/zip" }),
      }),
    );
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("forwards to CozyEngineV2 with all 3 FormData fields and returns envelope on 200", async () => {
    const mock = installFetchMock(200, {
      url: "https://cdn.example.com/upload/abc.png",
      filename: "abc.png",
      size: 8,
      mime: "image/png",
    });

    const res = await POST(
      makeMultipartRequest(
        {
          sessionId: SESSION_ID,
          personalityId: PERSONALITY_ID,
          file: makeFakeFile(),
        },
        BEARER,
        { size: 8 },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        url: "https://cdn.example.com/upload/abc.png",
        filename: "abc.png",
        size: 8,
        mime: "image/png",
      },
    });

    // Verify fetch was called with the right URL and a FormData body that
    // contains all 3 fields. fetch is responsible for the multipart
    // boundary (Content-Type is intentionally NOT set by the route).
    const [url, init] = mock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/v1/upload");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(BEARER);
    // Critical: Content-Type must NOT be set — fetch computes it with the boundary.
    expect(headers["Content-Type"]).toBeUndefined();
    const sentForm = init?.body as FormData;
    expect(sentForm).toBeInstanceOf(FormData);
    expect(sentForm.get("session_id")).toBe(SESSION_ID);
    expect(sentForm.get("personality_id")).toBe(PERSONALITY_ID);
    expect(sentForm.get("file")).toBeInstanceOf(Blob);
  });

  it("maps upstream 500 with PROVIDER_UNAVAILABLE code to 500 PROVIDER_UNAVAILABLE", async () => {
    installFetchMock(500, { code: "PROVIDER_UNAVAILABLE", message: "upload down" });
    const res = await POST(
      makeMultipartRequest(
        {
          sessionId: SESSION_ID,
          personalityId: PERSONALITY_ID,
          file: makeFakeFile(),
        },
        BEARER,
        { size: 8 },
      ),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });
});
