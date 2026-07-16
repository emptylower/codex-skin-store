import { redirect } from "react-router";

import { ActionForm } from "~/components/admin/action-form";
import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { listAuditActions } from "~/services/moderation/audit.server";
import {
  removeComment,
  removeTheme,
  restoreComment,
  restoreTheme,
  AdminError,
} from "~/services/moderation/admin.server";
import { requireModerator } from "~/services/moderation/require-moderator.server";
import { requireSameOrigin } from "~/utils/same-origin.server";
import type { Route } from "./+types/admin.theme";

export function meta() {
  return [
    { title: "Admin · Theme · Codex Skin Store" },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  let actor: Awaited<ReturnType<typeof requireModerator>>;
  try {
    actor = await requireModerator(
      request,
      context.cloudflare.env,
      "theme.remove",
    );
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      throw redirect(localePath(locale, "/auth/sign-in"));
    }
    throw error;
  }

  const url = new URL(request.url);
  const themeId = url.searchParams.get("themeId") ?? "";
  const commentId = url.searchParams.get("commentId") ?? "";

  let theme: {
    id: string;
    slug: string;
    visibility: string;
    moderation_status: string;
  } | null = null;
  if (themeId) {
    theme = await context.cloudflare.env.DB.prepare(
      `SELECT id, slug, visibility, moderation_status FROM themes WHERE id = ? LIMIT 1`,
    )
      .bind(themeId)
      .first();
  }

  const audit = themeId
    ? await listAuditActions(context.cloudflare.env.DB, {
        targetType: "theme",
        targetId: themeId,
        limit: 20,
      })
    : [];

  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    actor: { id: actor.id, role: actor.role },
    themeId,
    commentId,
    theme,
    audit,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  requireSameOrigin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const reason = String(form.get("reason") ?? "");
  const targetId = String(form.get("targetId") ?? "");
  const idempotencyKey = String(form.get("idempotencyKey") ?? "");
  if (!intent || !reason.trim() || !targetId || !idempotencyKey) {
    throw new Response("Bad Request", { status: 400 });
  }

  const db = context.cloudflare.env.DB;

  try {
    if (intent === "theme.remove") {
      const actor = await requireModerator(request, context.cloudflare.env, "theme.remove");
      await removeTheme(db, { actorId: actor.id, themeId: targetId, reason });
    } else if (intent === "theme.restore") {
      const actor = await requireModerator(request, context.cloudflare.env, "theme.restore");
      await restoreTheme(db, { actorId: actor.id, themeId: targetId, reason });
    } else if (intent === "comment.remove") {
      const actor = await requireModerator(request, context.cloudflare.env, "comment.remove");
      await removeComment(db, {
        actorId: actor.id,
        commentId: targetId,
        reason,
      });
    } else if (intent === "comment.restore") {
      const actor = await requireModerator(request, context.cloudflare.env, "comment.restore");
      await restoreComment(db, {
        actorId: actor.id,
        commentId: targetId,
        reason,
      });
    } else {
      throw new Response("Bad Request", { status: 400 });
    }
  } catch (error) {
    if (error instanceof AdminError) {
      throw new Response(error.code, {
        status: error.code === "forbidden" ? 403 : 400,
      });
    }
    throw error;
  }

  throw redirect(
    `${localePath(locale, "/admin/theme")}?themeId=${encodeURIComponent(targetId)}`,
  );
}

export default function AdminTheme({ loaderData }: Route.ComponentProps) {
  const { locale, theme, themeId, commentId, audit, actor } = loaderData;
  const action = localePath(locale, "/admin/theme");

  return (
    <main className="admin-console" data-testid="admin-theme">
      <h1>Theme moderation</h1>
      <p>
        Actor: {actor.role} ({actor.id})
      </p>

      <form method="get" className="admin-filters">
        <label>
          Theme ID
          <input name="themeId" defaultValue={themeId} />
        </label>
        <label>
          Comment ID
          <input name="commentId" defaultValue={commentId} />
        </label>
        <button type="submit">Load</button>
      </form>

      {theme ? (
        <section>
          <h2>
            {theme.slug}{" "}
            <small>
              ({theme.visibility}/{theme.moderation_status})
            </small>
          </h2>
          <ActionForm
            action={action}
            intent="theme.remove"
            targetId={theme.id}
            submitLabel="Remove theme"
            confirmMessage="Remove this theme from public view?"
            destructive
          />
          <ActionForm
            action={action}
            intent="theme.restore"
            targetId={theme.id}
            submitLabel="Restore theme"
          />
        </section>
      ) : null}

      {commentId ? (
        <section>
          <h2>Comment {commentId}</h2>
          <ActionForm
            action={action}
            intent="comment.remove"
            targetId={commentId}
            submitLabel="Remove comment"
            confirmMessage="Remove this comment?"
            destructive
          />
          <ActionForm
            action={action}
            intent="comment.restore"
            targetId={commentId}
            submitLabel="Restore comment"
          />
        </section>
      ) : null}

      <section>
        <h2>Audit trail</h2>
        <ul data-testid="admin-theme-audit">
          {audit.map((row) => (
            <li key={row.id}>
              {row.action}: {row.reason}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
