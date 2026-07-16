#!/usr/bin/env npx tsx
/**
 * Local metrics export helper.
 * Usage: npm run export:metrics [-- --csv]
 *
 * Prints fixture-shaped aggregate metrics for ops dry-runs.
 * Live D1 export: /:locale/admin/analytics-export (admin only).
 */

type ReleaseMetrics = {
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

function metricsToCsv(metrics: ReleaseMetrics): string {
  const rows: Array<[string, string]> = [
    ["period.start", metrics.period.start],
    ["period.end", metrics.period.end],
    ["deliveries.distinctUsers", String(metrics.deliveries.distinctUsers ?? "")],
    ["deliveries.distinctThemes", String(metrics.deliveries.distinctThemes)],
    ["deliveries.downloadCount", String(metrics.deliveries.downloadCount)],
    ["deliveries.promptCopyCount", String(metrics.deliveries.promptCopyCount)],
    ["engagement.favoritesAdded", String(metrics.engagement.favoritesAdded)],
    ["seo.approvedLandings", String(metrics.seo.approvedLandings)],
    ["suppressed", metrics.suppressed.join("|")],
  ];
  return ["metric,value", ...rows.map(([k, v]) => `${k},${v}`)].join("\n");
}

const fixture: ReleaseMetrics = {
  period: { start: "2026-07-09", end: "2026-07-16" },
  deliveries: {
    distinctUsers: null,
    distinctThemes: 0,
    downloadCount: 0,
    promptCopyCount: 0,
  },
  engagement: {
    favoritesAdded: 0,
    sevenDayFavoriteReturnRate: null,
  },
  catalog: {
    publicReadyThemes: 0,
    nonAdminCreatorShare: null,
  },
  community: {
    commentsPer100Deliveries: null,
    reportsPer100Deliveries: null,
  },
  seo: {
    approvedLandings: 0,
    candidateLandings: 0,
    reviewedTranslations: 0,
  },
  suppressed: ["deliveries.distinctUsers", "sevenDayFavoriteReturnRate"],
};

const format = process.argv.includes("--csv") ? "csv" : "json";
if (format === "csv") {
  console.log(metricsToCsv(fixture));
} else {
  console.log(JSON.stringify(fixture, null, 2));
}
