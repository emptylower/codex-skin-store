import { redirect } from "react-router";

import { parseLocale } from "~/i18n/config";
import {
  clientIpFromRequest,
  createD1AbuseGate,
  hashIp,
} from "~/platform/cloudflare/rate-limit.server";
import {
  CommentError,
  deleteOwnComment,
  hideCommentByAuthor,
  postComment,
} from "~/services/comments/comments.server";
import { getOptionalUser, requireUser } from "~/services/identity.server";
import {
  createIntent,
  signInPathWithIntent,
} from "~/services/identity/intents.server";
import type { Route } from "./+types/theme-comments";

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });
  const slug = params.slug ?? "";
  if (!slug) throw new Response("Not Found", { status: 404 });

  const env = context.cloudflare.env;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "post");
  const themeId = String(form.get("themeId") ?? "");
  const returnPath = String(
    form.get("returnPath") ?? `/${locale}/themes/${slug}`,
  );
  const body = String(form.get("body") ?? "");

  const user = await getOptionalUser(request, env);

  if (intent === "post") {
    if (!themeId) throw new Response("Bad Request", { status: 400 });
    if (!user) {
      const intentRec = await createIntent(env.DB, {
        action: "comment",
        themeId,
        payload: { returnPath, body: body.slice(0, 1000) },
      });
      throw redirect(
        signInPathWithIntent(locale, intentRec.token, returnPath),
      );
    }

    const ip = clientIpFromRequest(request);
    const ipHash = await hashIp(ip, env.BETTER_AUTH_SECRET);
    const gate = createD1AbuseGate(env.DB);
    const gateResult = await gate.check({
      action: "comment",
      userId: user.id,
      ipHash,
    });
    if (!gateResult.allowed) {
      throw new Response("Too Many Requests", { status: 429 });
    }

    try {
      await postComment(env.DB, {
        themeId,
        userId: user.id,
        authorLabel:
          ("name" in user && typeof user.name === "string" && user.name) ||
          ("displayName" in user &&
            typeof (user as { displayName?: string }).displayName === "string" &&
            (user as { displayName?: string }).displayName) ||
          "User",
        body,
      });
    } catch (error) {
      if (error instanceof CommentError) {
        throw new Response(error.code, { status: 400 });
      }
      throw error;
    }

    throw redirect(returnPath);
  }

  if (intent === "delete") {
    await requireUser(request, env);
    const commentId = String(form.get("commentId") ?? "");
    if (!commentId || !user) throw new Response("Bad Request", { status: 400 });
    try {
      await deleteOwnComment(env.DB, {
        commentId,
        userId: user.id,
      });
    } catch (error) {
      if (error instanceof CommentError) {
        throw new Response(error.code, { status: 400 });
      }
      throw error;
    }
    throw redirect(returnPath);
  }

  if (intent === "hide") {
    await requireUser(request, env);
    const commentId = String(form.get("commentId") ?? "");
    if (!commentId || !user) throw new Response("Bad Request", { status: 400 });
    try {
      await hideCommentByAuthor(env.DB, {
        commentId,
        authorUserId: user.id,
      });
    } catch (error) {
      if (error instanceof CommentError) {
        const status = error.code === "forbidden" ? 403 : 400;
        throw new Response(error.code, { status });
      }
      throw error;
    }
    throw redirect(returnPath);
  }

  throw new Response("Bad Request", { status: 400 });
}

export async function loader() {
  return new Response("Method Not Allowed", { status: 405 });
}
