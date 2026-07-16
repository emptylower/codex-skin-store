import { requireUser } from "~/services/identity.server";
import { createUploadDeps } from "~/services/upload-deps.server";
import { issueUpload, UploadError } from "~/services/uploads.server";
import { requireSameOrigin } from "~/utils/same-origin.server";
import type { Route } from "./+types/api.uploads.presign";

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

  let body: {
    themeId?: string;
    version?: number;
    contentType?: string;
    bytes?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const env = context.cloudflare.env;
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY
  ) {
    return json({ error: "presign_not_configured" }, 503);
  }

  try {
    const issued = await issueUpload(createUploadDeps(env), {
      userId: user.id,
      themeId: String(body.themeId ?? ""),
      version: Number(body.version),
      contentType: String(body.contentType ?? ""),
      bytes: Number(body.bytes),
    });

    return json({
      uploadId: issued.uploadId,
      key: issued.key,
      url: issued.url,
      headers: issued.headers,
      expiresAt: issued.expiresAt,
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
