export const REPORT_REASONS = [
  "copyright",
  "sexual_content",
  "harassment",
  "malware_or_unsafe",
  "spam",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
