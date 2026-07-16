import { requireUser } from "~/services/identity.server";
import {
  CreatorThemeError,
  getCreatorArtifact,
} from "~/services/creator-themes.server";
import type { Route } from "./+types/api.creator-artifacts.$themeId.$version.$artifact";

function isAttachment(contentType: string): boolean {
  return (
    contentType.includes("json") ||
    contentType.includes("markdown") ||
    contentType.startsWith("text/")
  );
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context.cloudflare.env);
  const themeId = params.themeId ?? "";
  const version = Number(params.version);
  const artifact = params.artifact ?? "";

  if (!themeId || !Number.isInteger(version) || version < 1 || !artifact) {
    throw new Response("Not Found", { status: 404 });
  }

  try {
    const result = await getCreatorArtifact(
      {
        db: context.cloudflare.env.DB,
        packages: context.cloudflare.env.PACKAGES,
      },
      {
        userId: user.id,
        themeId,
        version,
        artifact,
      },
    );

    const headers = new Headers({
      "Content-Type": result.contentType,
      "Cache-Control": result.cacheControl,
      "X-Content-Type-Options": "nosniff",
    });
    if (isAttachment(result.contentType)) {
      headers.set(
        "Content-Disposition",
        `attachment; filename="${result.filename}"`,
      );
    }

    return new Response(result.body.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    if (error instanceof CreatorThemeError) {
      if (error.code === "forbidden") {
        throw new Response("Forbidden", { status: 403 });
      }
      if (error.code === "not_found") {
        throw new Response("Not Found", { status: 404 });
      }
      throw new Response(error.code, { status: 400 });
    }
    throw error;
  }
}

export async function action() {
  return new Response("Method Not Allowed", { status: 405 });
}
