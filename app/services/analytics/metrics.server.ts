import { METRICS_MIN_SEGMENT_USERS } from "~/db/schema/analytics";
import { canPerform } from "~/domain/moderation/policy";

export type MetricsPeriod = {
  startMs: number;
  endMs: number;
};

export type ReleaseMetrics = {
  period: { start: string; end: string };
  deliveries: {
    distinctUsers: number | null;
    distinctThemes: number;
    downloadCount: number;
    promptCopyCount: number;
  };
  engagement: {
    favoritesAdded: number;
    sevenDayFavoriteReturnRate: number | null;
  };
  catalog: {
    publicReadyThemes: number;
    nonAdminCreatorShare: number | null;
  };
  community: {
    commentsPer100Deliveries: number | null;
    reportsPer100Deliveries: number | null;
  };
  seo: {
    approvedLandings: number;
    candidateLandings: number;
    reviewedTranslations: number;
  };
  suppressed: string[];
};

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function weekPeriodUtc(now = Date.now()): MetricsPeriod {
  const endMs = now;
  const startMs = now - 7 * 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

function suppressCount(
  value: number,
  minUsers: number,
  distinctUsers: number,
  key: string,
  suppressed: string[],
): number | null {
  if (distinctUsers < minUsers) {
    suppressed.push(key);
    return null;
  }
  return value;
}

/**
 * Privacy-bounded aggregate metrics. Never returns user IDs, tokens, IPs, or comment text.
 */
export async function computeReleaseMetrics(
  db: D1Database,
  period: MetricsPeriod = weekPeriodUtc(),
): Promise<ReleaseMetrics> {
  const suppressed: string[] = [];
  const { startMs, endMs } = period;

  const deliveryUsers = await db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) AS c
       FROM engagement_events
       WHERE created_at >= ? AND created_at < ?
         AND event_type IN ('download', 'prompt_copy')
         AND user_id IS NOT NULL`,
    )
    .bind(startMs, endMs)
    .first<{ c: number }>();

  const deliveryThemes = await db
    .prepare(
      `SELECT COUNT(DISTINCT theme_id) AS c
       FROM engagement_events
       WHERE created_at >= ? AND created_at < ?
         AND event_type IN ('download', 'prompt_copy')`,
    )
    .bind(startMs, endMs)
    .first<{ c: number }>();

  const downloads = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM engagement_events
       WHERE created_at >= ? AND created_at < ? AND event_type = 'download'`,
    )
    .bind(startMs, endMs)
    .first<{ c: number }>();

  const prompts = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM engagement_events
       WHERE created_at >= ? AND created_at < ? AND event_type = 'prompt_copy'`,
    )
    .bind(startMs, endMs)
    .first<{ c: number }>();

  const favorites = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM engagement_events
       WHERE created_at >= ? AND created_at < ? AND event_type = 'favorite_add'`,
    )
    .bind(startMs, endMs)
    .first<{ c: number }>();

  const distinctUsers = deliveryUsers?.c ?? 0;
  const deliveryCount = (downloads?.c ?? 0) + (prompts?.c ?? 0);

  // Users who favorited in window and favorited again in prior 7d before that event — simplified return rate.
  const returnRow = await db
    .prepare(
      `SELECT COUNT(DISTINCT e1.user_id) AS returned
       FROM engagement_events e1
       WHERE e1.event_type = 'favorite_add'
         AND e1.created_at >= ? AND e1.created_at < ?
         AND e1.user_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM engagement_events e0
           WHERE e0.user_id = e1.user_id
             AND e0.event_type = 'favorite_add'
             AND e0.created_at < e1.created_at
             AND e0.created_at >= e1.created_at - 604800000
         )`,
    )
    .bind(startMs, endMs)
    .first<{ returned: number }>();

  const favUsers = await db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) AS c FROM engagement_events
       WHERE event_type = 'favorite_add'
         AND created_at >= ? AND created_at < ?
         AND user_id IS NOT NULL`,
    )
    .bind(startMs, endMs)
    .first<{ c: number }>();

  let sevenDayFavoriteReturnRate: number | null = null;
  if ((favUsers?.c ?? 0) < METRICS_MIN_SEGMENT_USERS) {
    suppressed.push("sevenDayFavoriteReturnRate");
  } else if ((favUsers?.c ?? 0) > 0) {
    sevenDayFavoriteReturnRate =
      (returnRow?.returned ?? 0) / (favUsers?.c ?? 1);
  }

  const publicReady = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM themes
       WHERE visibility = 'public'
         AND package_status = 'ready'
         AND moderation_status != 'removed'`,
    )
    .first<{ c: number }>();

  const creatorShare = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN u.role != 'admin' THEN 1 ELSE 0 END) AS non_admin,
         COUNT(*) AS total
       FROM themes th
       JOIN users u ON u.id = th.author_id
       WHERE th.visibility = 'public'
         AND th.package_status = 'ready'
         AND th.moderation_status != 'removed'`,
    )
    .first<{ non_admin: number; total: number }>();

  let nonAdminCreatorShare: number | null = null;
  if ((creatorShare?.total ?? 0) > 0) {
    nonAdminCreatorShare =
      (creatorShare?.non_admin ?? 0) / (creatorShare?.total ?? 1);
  }

  const comments = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM comments
       WHERE created_at >= ? AND created_at < ?
         AND status = 'visible'`,
    )
    .bind(startMs, endMs)
    .first<{ c: number }>();

  const reports = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM reports
       WHERE created_at >= ? AND created_at < ?`,
    )
    .bind(startMs, endMs)
    .first<{ c: number }>();

  const approvedLandings = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM seo_landings WHERE index_status = 'approved'`,
    )
    .first<{ c: number }>();
  const candidateLandings = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM seo_landings WHERE index_status = 'candidate'`,
    )
    .first<{ c: number }>();
  const reviewedTranslations = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM seo_landing_translations
       WHERE translation_status = 'reviewed'`,
    )
    .first<{ c: number }>();

  const per100 = (count: number): number | null => {
    if (deliveryCount === 0) return null;
    return (count / deliveryCount) * 100;
  };

  return {
    period: { start: isoDay(startMs), end: isoDay(endMs) },
    deliveries: {
      distinctUsers: suppressCount(
        distinctUsers,
        METRICS_MIN_SEGMENT_USERS,
        distinctUsers,
        "deliveries.distinctUsers",
        suppressed,
      ),
      distinctThemes: deliveryThemes?.c ?? 0,
      downloadCount: downloads?.c ?? 0,
      promptCopyCount: prompts?.c ?? 0,
    },
    engagement: {
      favoritesAdded: favorites?.c ?? 0,
      sevenDayFavoriteReturnRate,
    },
    catalog: {
      publicReadyThemes: publicReady?.c ?? 0,
      nonAdminCreatorShare,
    },
    community: {
      commentsPer100Deliveries: per100(comments?.c ?? 0),
      reportsPer100Deliveries: per100(reports?.c ?? 0),
    },
    seo: {
      approvedLandings: approvedLandings?.c ?? 0,
      candidateLandings: candidateLandings?.c ?? 0,
      reviewedTranslations: reviewedTranslations?.c ?? 0,
    },
    suppressed,
  };
}

export function metricsToCsv(metrics: ReleaseMetrics): string {
  const rows: Array<[string, string]> = [
    ["period.start", metrics.period.start],
    ["period.end", metrics.period.end],
    [
      "deliveries.distinctUsers",
      String(metrics.deliveries.distinctUsers ?? ""),
    ],
    ["deliveries.distinctThemes", String(metrics.deliveries.distinctThemes)],
    ["deliveries.downloadCount", String(metrics.deliveries.downloadCount)],
    ["deliveries.promptCopyCount", String(metrics.deliveries.promptCopyCount)],
    ["engagement.favoritesAdded", String(metrics.engagement.favoritesAdded)],
    [
      "engagement.sevenDayFavoriteReturnRate",
      metrics.engagement.sevenDayFavoriteReturnRate == null
        ? ""
        : String(metrics.engagement.sevenDayFavoriteReturnRate),
    ],
    ["catalog.publicReadyThemes", String(metrics.catalog.publicReadyThemes)],
    [
      "catalog.nonAdminCreatorShare",
      metrics.catalog.nonAdminCreatorShare == null
        ? ""
        : String(metrics.catalog.nonAdminCreatorShare),
    ],
    [
      "community.commentsPer100Deliveries",
      metrics.community.commentsPer100Deliveries == null
        ? ""
        : String(metrics.community.commentsPer100Deliveries),
    ],
    [
      "community.reportsPer100Deliveries",
      metrics.community.reportsPer100Deliveries == null
        ? ""
        : String(metrics.community.reportsPer100Deliveries),
    ],
    ["seo.approvedLandings", String(metrics.seo.approvedLandings)],
    ["seo.candidateLandings", String(metrics.seo.candidateLandings)],
    ["seo.reviewedTranslations", String(metrics.seo.reviewedTranslations)],
    ["suppressed", metrics.suppressed.join("|")],
  ];
  return ["metric,value", ...rows.map(([k, v]) => `${k},${v}`)].join("\n");
}

export function assertCanExportMetrics(role: string | null | undefined): void {
  if (!canPerform(role, "analytics.export")) {
    throw new Response("Forbidden", { status: 403 });
  }
}
