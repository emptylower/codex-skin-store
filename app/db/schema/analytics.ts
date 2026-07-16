/**
 * Analytics schema markers for release metrics.
 * Event storage lives in engagement_events; this module documents
 * query contracts and index expectations used by metrics.server.ts.
 */

export const METRIC_PERIODS = ["day", "week"] as const;
export type MetricPeriod = (typeof METRIC_PERIODS)[number];

/** Minimum distinct users before a segment is exportable. */
export const METRICS_MIN_SEGMENT_USERS = 5;

export type MetricExportFormat = "json" | "csv";
