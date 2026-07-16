import { redirect } from "react-router";

import { ActionForm } from "~/components/admin/action-form";
import { ReportTable } from "~/components/admin/report-table";
import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { listAuditActions } from "~/services/moderation/audit.server";
import {
  listOpenReports,
  resolveReport,
  AdminError,
} from "~/services/moderation/admin.server";
import { requireModerator } from "~/services/moderation/require-moderator.server";
import { requireSameOrigin } from "~/utils/same-origin.server";
import type { Route } from "./+types/admin.reports";

export function meta() {
  return [
    { title: "Admin · Reports · Codex Skin Store" },
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
      "report.list",
    );
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      throw redirect(localePath(locale, "/auth/sign-in"));
    }
    throw error;
  }

  const url = new URL(request.url);
  const status =
    (url.searchParams.get("status") as "open" | "dismissed" | "resolved") ||
    "open";
  const targetType = url.searchParams.get("targetType") as
    | "theme"
    | "comment"
    | "user"
    | null;
  const reason = url.searchParams.get("reason") || undefined;

  const reports = await listOpenReports(context.cloudflare.env.DB, {
    actorId: actor.id,
    status,
    targetType: targetType ?? undefined,
    reason,
  });

  const recentAudit = await listAuditActions(context.cloudflare.env.DB, {
    limit: 10,
  });

  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    actor: { id: actor.id, role: actor.role },
    reports,
    filters: { status, targetType, reason: reason ?? "" },
    recentAudit,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  requireSameOrigin(request);
  const actor = await requireModerator(
    request,
    context.cloudflare.env,
    "report.resolve",
  );

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const reportId = String(form.get("reportId") ?? "");
  const reason = String(form.get("reason") ?? "");
  const idempotencyKey = String(form.get("idempotencyKey") ?? "");
  if (!reportId || !reason.trim() || !idempotencyKey) {
    throw new Response("Bad Request", { status: 400 });
  }

  try {
    if (intent === "resolve") {
      await resolveReport(context.cloudflare.env.DB, {
        actorId: actor.id,
        reportId,
        outcome: "resolved",
        reason,
      });
    } else if (intent === "dismiss") {
      await resolveReport(context.cloudflare.env.DB, {
        actorId: actor.id,
        reportId,
        outcome: "dismissed",
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

  throw redirect(localePath(locale, "/admin/reports"));
}

export default function AdminReports({ loaderData }: Route.ComponentProps) {
  const { locale, reports, filters, recentAudit, actor } = loaderData;

  return (
    <main className="admin-console" data-testid="admin-reports">
      <header>
        <h1>Moderation reports</h1>
        <p>
          Signed in as {actor.role} ({actor.id})
        </p>
      </header>

      <form method="get" className="admin-filters">
        <label>
          Status
          <select name="status" defaultValue={filters.status}>
            <option value="open">open</option>
            <option value="resolved">resolved</option>
            <option value="dismissed">dismissed</option>
          </select>
        </label>
        <label>
          Target type
          <select name="targetType" defaultValue={filters.targetType ?? ""}>
            <option value="">any</option>
            <option value="theme">theme</option>
            <option value="comment">comment</option>
            <option value="user">user</option>
          </select>
        </label>
        <label>
          Reason
          <input name="reason" defaultValue={filters.reason} />
        </label>
        <button type="submit">Filter</button>
      </form>

      <ReportTable reports={reports as never} locale={locale} />

      <section>
        <h2>Recent audit</h2>
        <ul data-testid="admin-audit-list">
          {recentAudit.map((row) => (
            <li key={row.id}>
              {row.action} · {row.targetType}:{row.targetId} · {row.reason}
            </li>
          ))}
        </ul>
      </section>

      <nav>
        <a href={localePath(locale, "/admin/theme")}>Theme actions</a>
        {" · "}
        <a href={localePath(locale, "/admin/user")}>User actions</a>
      </nav>
    </main>
  );
}

// Keep ActionForm imported for tree visibility in admin package.
void ActionForm;
