import { redirect } from "react-router";

import { parseLocale } from "~/i18n/config";
import {
  addFavorite,
  FavoriteError,
  removeFavorite,
} from "~/services/engagement/favorites.server";
import { getOptionalUser } from "~/services/identity.server";
import {
  createIntent,
  signInPathWithIntent,
} from "~/services/identity/intents.server";
import type { Route } from "./+types/favorite";

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  const form = await request.formData();
  const themeId = String(form.get("themeId") ?? "");
  const slug = String(form.get("slug") ?? "");
  const op = String(form.get("op") ?? "add");
  const returnPath = String(
    form.get("returnPath") ?? `/${locale}/themes/${slug}`,
  );

  if (!themeId) throw new Response("Bad Request", { status: 400 });

  const env = context.cloudflare.env;
  const user = await getOptionalUser(request, env);

  if (!user) {
    const intent = await createIntent(env.DB, {
      action: "favorite",
      themeId,
      payload: { returnPath },
    });
    throw redirect(signInPathWithIntent(locale, intent.token, returnPath));
  }

  try {
    if (op === "remove") {
      await removeFavorite(env.DB, { userId: user.id, themeId });
    } else {
      await addFavorite(env.DB, { userId: user.id, themeId });
    }
  } catch (error) {
    if (error instanceof FavoriteError) {
      if (error.code === "not_found" || error.code === "not_favoritable") {
        throw new Response("Not Found", { status: 404 });
      }
      throw new Response(error.code, { status: 400 });
    }
    throw error;
  }

  // Prefer redirect back for progressive enhancement.
  if (request.headers.get("Accept")?.includes("application/json")) {
    return Response.json({ ok: true, favorited: op !== "remove" });
  }
  throw redirect(returnPath);
}

export async function loader() {
  return new Response("Method Not Allowed", { status: 405 });
}
