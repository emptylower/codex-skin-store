import { requireUser } from "~/services/identity.server";
import { createUploadDeps } from "~/services/upload-deps.server";
import { completeUpload, UploadError } from "~/services/uploads.server";
import { requireSameOrigin } from "~/utils/same-origin.server";
import type { Route } from "./+types/api.uploads.complete";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  requireSameOrigin(request);
  const user = await requireUser(request, context.cloudflare.env);

  let body: { uploadId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  try {
    const result = await completeUpload(
      createUploadDeps(context.cloudflare.env),
      {
        userId: user.id,
        uploadId: String(body.uploadId ?? ""),
      },
    );

    return json({
      ok: true,
      jobId: result.jobId,
      queued: result.queued,
    });
  } catch (error) {
    if (error instanceof UploadError) {
      const status =
        error.code === "forbidden"
          ? 403
          : error.code === "not_found"
            ? 404
            : 400;
      return json({ error: error.code }, status);
    }
    throw error;
  }
}

export async function loader() {
  return json({ error: "method_not_allowed" }, 405);
}
