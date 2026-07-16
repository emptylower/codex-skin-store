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
  "seo_landing",
] as const;
export type ModerationTargetType = (typeof MODERATION_TARGET_TYPES)[number];

export const COPYRIGHT_CLAIM_STATUSES = [
  "open",
  "needs_information",
  "accepted",
  "rejected",
  "withdrawn",
] as const;
export type CopyrightClaimStatus = (typeof COPYRIGHT_CLAIM_STATUSES)[number];

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

export const copyrightClaims = sqliteTable("copyright_claims", {
  id: text("id").primaryKey(),
  claimantEmail: text("claimant_email").notNull(),
  claimantName: text("claimant_name").notNull(),
  targetThemeId: text("target_theme_id").notNull(),
  rightsBasis: text("rights_basis").notNull(),
  statement: text("statement").notNull(),
  signature: text("signature").notNull(),
  status: text("status", { enum: COPYRIGHT_CLAIM_STATUSES }).notNull(),
  assignedTo: text("assigned_to"),
  createdAt: integer("created_at").notNull(),
  resolvedAt: integer("resolved_at"),
});

export const copyrightEvidence = sqliteTable("copyright_evidence", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => copyrightClaims.id),
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  mediaType: text("media_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  createdAt: integer("created_at").notNull(),
});
