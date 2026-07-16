import { parseLocale } from "~/i18n/config";
import {
  assertCanExportMetrics,
  computeReleaseMetrics,
  metricsToCsv,
  weekPeriodUtc,
} from "~/services/analytics/metrics.server";
import { requireModerator } from "~/services/moderation/require-moderator.server";
import type { Route } from "./+types/analytics-export";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  const actor = await requireModerator(
    request,
    context.cloudflare.env,
    "analytics.export",
  );
  assertCanExportMetrics(actor.role);

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const metrics = await computeReleaseMetrics(
    context.cloudflare.env.DB,
    weekPeriodUtc(),
  );

  if (format === "csv") {
    return new Response(metricsToCsv(metrics), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="release-metrics.csv"',
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  return Response.json(metrics, {
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
