import { z } from "zod";
import {
  errorResponse,
  errorResponseFromUpstream,
  unauthorizedResponse,
  validationResponse,
} from "@/lib/api/bff";

const UploadFormSchema = z.object({
  sessionId: z.string().min(1),
  personalityId: z.string().min(1),
  // file is read separately as a Blob
});

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain|application\/json)$/;

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorizedResponse();

  // Multipart: req.formData() consumes the body stream. We must read it here
  // and rebuild a fresh FormData for the upstream fetch — we cannot forward
  // the consumed stream. File Blob is checked separately so the user gets a
  // friendlier message than a zod schema error.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse({
      code: "INVALID_BODY",
      message: "Expected multipart/form-data",
      status: 400,
    });
  }

  const fieldsResult = UploadFormSchema.safeParse({
    sessionId: form.get("sessionId"),
    personalityId: form.get("personalityId"),
  });
  if (!fieldsResult.success) return validationResponse(fieldsResult.error);

  const file = form.get("file");
  if (!file || !(file instanceof Blob)) {
    return errorResponse({
      code: "MISSING_FILE",
      message: "Expected a 'file' field in the multipart body",
      status: 400,
    });
  }
  if (file.size === 0) {
    return errorResponse({
      code: "EMPTY_FILE",
      message: "File is empty",
      status: 400,
    });
  }
  if (file.size > MAX_FILE_SIZE) {
    return errorResponse({
      code: "FILE_TOO_LARGE",
      message: `Max ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      status: 413,
    });
  }
  if (!ALLOWED_MIME.test(file.type)) {
    return errorResponse({
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: `MIME ${file.type} not allowed`,
      status: 415,
    });
  }

  // Rebuild FormData for upstream. The file is a Blob reference (not yet
  // consumed), so it can be re-set into a new FormData. Filename falls back
  // to "upload" when the Blob doesn't carry one (e.g. constructed in tests).
  const upstreamForm = new FormData();
  upstreamForm.set("file", file, (file as File).name ?? "upload");
  upstreamForm.set("session_id", fieldsResult.data.sessionId);
  upstreamForm.set("personality_id", fieldsResult.data.personalityId);

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/upload`, {
    method: "POST",
    // DO NOT set Content-Type — fetch will compute it with the multipart
    // boundary. Setting it manually would strip the boundary and break
    // upstream parsing.
    headers: { Authorization: auth },
    body: upstreamForm,
  });

  if (!upstream.ok) {
    let body: unknown = null;
    try {
      body = await upstream.json();
    } catch {
      /* non-JSON upstream error */
    }
    return errorResponseFromUpstream(upstream.status, body);
  }

  const data = await upstream.json();
  return Response.json({ ok: true, data });
}
