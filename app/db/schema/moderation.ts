import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const REPORT_TARGET_TYPES = ["theme", "comment", "user"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_STATUSES = ["open", "dismissed", "resolved"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const MODERATION_TARGET_TYPES = [
  "theme",
  "comment",
  "user",
  "report",
  "copyright_claim",
] as const;
export type ModerationTargetType = (typeof MODERATION_TARGET_TYPES)[number];

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id"),
  targetType: text("target_type", { enum: REPORT_TARGET_TYPES }).notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status", { enum: REPORT_STATUSES }).notNull(),
  resolvedBy: text("resolved_by"),
  createdAt: integer("created_at").notNull(),
  resolvedAt: integer("resolved_at"),
});

export const moderationActions = sqliteTable("moderation_actions", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  targetType: text("target_type", { enum: MODERATION_TARGET_TYPES }).notNull(),
  targetId: text("target_id").notNull(),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  beforeJson: text("before_json").notNull(),
  afterJson: text("after_json").notNull(),
  createdAt: integer("created_at").notNull(),
});
