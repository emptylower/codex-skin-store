import { redirect } from "react-router";

import { ActionForm } from "~/components/admin/action-form";
import { canPerform } from "~/domain/moderation/policy";
import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import {
  changeUserRole,
  restoreUploads,
  suspendUploads,
  AdminError,
} from "~/services/moderation/admin.server";
import { listAuditActions } from "~/services/moderation/audit.server";
import { requireModerator } from "~/services/moderation/require-moderator.server";
import { requireSameOrigin } from "~/utils/same-origin.server";
import type { Route } from "./+types/admin.user";

export function meta() {
  return [
    { title: "Admin · Users · Codex Skin Store" },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  let actor: Awaited<ReturnType<typeof requireModerator>>;
  try {
    // Moderators can open the page (read-only); admin-only actions are gated in UI + action.
    actor = await requireModerator(
      request,
      context.cloudflare.env,
      "report.list",
    );
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      throw redirect(localePath(locale, "/auth/sign-in"));
    }
    throw error;
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ?? "";
  let user: {
    id: string;
    handle: string;
    role: string;
    upload_status: string;
  } | null = null;
  if (userId) {
    user = await context.cloudflare.env.DB.prepare(
      `SELECT id, handle, role, upload_status FROM users WHERE id = ? LIMIT 1`,
    )
      .bind(userId)
      .first();
  }

  const audit = userId
    ? await listAuditActions(context.cloudflare.env.DB, {
        targetType: "user",
        targetId: userId,
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
    canSuspend: canPerform(actor.role, "user.suspend_uploads"),
    canChangeRole: canPerform(actor.role, "user.change_role"),
    userId,
    user,
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
  const role = String(form.get("role") ?? "user");
  if (!intent || !reason.trim() || !targetId || !idempotencyKey) {
    throw new Response("Bad Request", { status: 400 });
  }

  const db = context.cloudflare.env.DB;

  try {
    if (intent === "user.suspend_uploads") {
      const actor = await requireModerator(
        request,
        context.cloudflare.env,
        "user.suspend_uploads",
      );
      await suspendUploads(db, { actorId: actor.id, userId: targetId, reason });
    } else if (intent === "user.restore_uploads") {
      const actor = await requireModerator(
        request,
        context.cloudflare.env,
        "user.restore_uploads",
      );
      await restoreUploads(db, { actorId: actor.id, userId: targetId, reason });
    } else if (intent === "user.change_role") {
      const actor = await requireModerator(
        request,
        context.cloudflare.env,
        "user.change_role",
      );
      if (!["user", "moderator", "admin"].includes(role)) {
        throw new Response("Bad Request", { status: 400 });
      }
      await changeUserRole(db, {
        actorId: actor.id,
        userId: targetId,
        role: role as "user" | "moderator" | "admin",
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
    `${localePath(locale, "/admin/user")}?userId=${encodeURIComponent(targetId)}`,
  );
}

export default function AdminUser({ loaderData }: Route.ComponentProps) {
  const { locale, user, userId, canSuspend, canChangeRole, audit, actor } =
    loaderData;
  const action = localePath(locale, "/admin/user");

  return (
    <main className="admin-console" data-testid="admin-user">
      <h1>User moderation</h1>
      <p>
        Actor: {actor.role} ({actor.id})
      </p>

      <form method="get" className="admin-filters">
        <label>
          User ID
          <input name="userId" defaultValue={userId} />
        </label>
        <button type="submit">Load</button>
      </form>

      {user ? (
        <section>
          <h2>
            @{user.handle}{" "}
            <small>
              ({user.role}/{user.upload_status})
            </small>
          </h2>

          {canSuspend ? (
            <>
              <ActionForm
                action={action}
                intent="user.suspend_uploads"
                targetId={user.id}
                submitLabel="Suspend uploads"
                confirmMessage="Suspend this user's upload permission?"
                destructive
              />
              <ActionForm
                action={action}
                intent="user.restore_uploads"
                targetId={user.id}
                submitLabel="Restore uploads"
              />
            </>
          ) : (
            <p data-testid="admin-user-no-suspend">
              Only admins may suspend uploads.
            </p>
          )}

          {canChangeRole ? (
            <ActionForm
              action={action}
              intent="user.change_role"
              targetId={user.id}
              submitLabel="Change role"
              confirmMessage="Change this user's role?"
              destructive
            >
              <label>
                Role
                <select name="role" defaultValue={user.role}>
                  <option value="user">user</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                </select>
              </label>
            </ActionForm>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2>Audit trail</h2>
        <ul data-testid="admin-user-audit">
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
