import { z } from "zod";

export const REPORT_REASONS = [
  "copyright",
  "sexual_content",
  "harassment",
  "malware_or_unsafe",
  "spam",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const reportInputSchema = z.object({
  targetType: z.enum(["theme", "comment", "user"]),
  targetId: z.string().min(1).max(128),
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(2000).optional(),
});

export type ReportInput = z.infer<typeof reportInputSchema>;

export class ReportError extends Error {
  readonly code:
    | "invalid"
    | "not_found"
    | "unauthorized"
    | "rate_limited"
    | "duplicate"
    | "challenge_required";

  constructor(code: ReportError["code"], message?: string) {
    super(message ?? code);
    this.name = "ReportError";
    this.code = code;
  }
}

async function targetExists(
  db: D1Database,
  targetType: ReportInput["targetType"],
  targetId: string,
): Promise<boolean> {
  if (targetType === "theme") {
    const row = await db
      .prepare(`SELECT id FROM themes WHERE id = ? LIMIT 1`)
      .bind(targetId)
      .first();
    return Boolean(row);
  }
  if (targetType === "comment") {
    const row = await db
      .prepare(`SELECT id FROM comments WHERE id = ? LIMIT 1`)
      .bind(targetId)
      .first();
    return Boolean(row);
  }
  const row = await db
    .prepare(`SELECT id FROM users WHERE id = ? LIMIT 1`)
    .bind(targetId)
    .first();
  return Boolean(row);
}

/**
 * Create an open report. Does not auto-hide content.
 * Dedupes same reporter/target/reason within 24 hours.
 */
export async function createReport(
  db: D1Database,
  input: {
    reporterId: string;
    targetType: ReportInput["targetType"];
    targetId: string;
    reason: ReportReason;
    details?: string;
    now?: number;
  },
): Promise<{ id: string; status: "open"; created: boolean }> {
  const parsed = reportInputSchema.safeParse({
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    details: input.details,
  });
  if (!parsed.success) {
    throw new ReportError("invalid");
  }

  if (!(await targetExists(db, parsed.data.targetType, parsed.data.targetId))) {
    throw new ReportError("not_found");
  }

  const now = input.now ?? Date.now();
  const since = now - 24 * 60 * 60 * 1000;

  const existing = await db
    .prepare(
      `SELECT id FROM reports
       WHERE reporter_id = ?
         AND target_type = ?
         AND target_id = ?
         AND reason = ?
         AND created_at >= ?
       LIMIT 1`,
    )
    .bind(
      input.reporterId,
      parsed.data.targetType,
      parsed.data.targetId,
      parsed.data.reason,
      since,
    )
    .first<{ id: string }>();

  if (existing) {
    throw new ReportError("duplicate");
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO reports (
         id, reporter_id, target_type, target_id, reason, details,
         status, resolved_by, created_at, resolved_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, ?, NULL)`,
    )
    .bind(
      id,
      input.reporterId,
      parsed.data.targetType,
      parsed.data.targetId,
      parsed.data.reason,
      parsed.data.details?.trim() || null,
      now,
    )
    .run();

  // Explicit: no auto-hide of target content.
  return { id, status: "open", created: true };
}
