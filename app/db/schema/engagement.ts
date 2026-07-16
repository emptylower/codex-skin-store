import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const AUTH_INTENT_ACTIONS = [
  "download",
  "copy_prompt",
  "favorite",
  "comment",
  "report",
] as const;

export type AuthIntentAction = (typeof AUTH_INTENT_ACTIONS)[number];

export const ENGAGEMENT_EVENT_TYPES = [
  "download",
  "prompt_copy",
  "favorite_add",
  "favorite_remove",
] as const;

export type EngagementEventType = (typeof ENGAGEMENT_EVENT_TYPES)[number];

export const COMMENT_STATUSES = [
  "visible",
  "hidden_by_author",
  "removed_by_admin",
  "deleted_by_user",
] as const;

export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const authIntents = sqliteTable("auth_intents", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  action: text("action", { enum: AUTH_INTENT_ACTIONS }).notNull(),
  themeId: text("theme_id").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  expiresAt: integer("expires_at").notNull(),
  consumedAt: integer("consumed_at"),
  createdAt: integer("created_at").notNull(),
});

export const favorites = sqliteTable(
  "favorites",
  {
    userId: text("user_id").notNull(),
    themeId: text("theme_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.themeId] })],
);

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  themeId: text("theme_id").notNull(),
  userId: text("user_id"),
  authorLabel: text("author_label").notNull(),
  body: text("body"),
  status: text("status", { enum: COMMENT_STATUSES }).notNull(),
  createdAt: integer("created_at").notNull(),
  editedAt: integer("edited_at"),
});

export const engagementEvents = sqliteTable("engagement_events", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  themeId: text("theme_id").notNull(),
  themeVersion: integer("theme_version").notNull(),
  eventType: text("event_type", { enum: ENGAGEMENT_EVENT_TYPES }).notNull(),
  platform: text("platform"),
  createdAt: integer("created_at").notNull(),
});

export const rateLimitWindows = sqliteTable(
  "rate_limit_windows",
  {
    bucketKey: text("bucket_key").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.bucketKey, table.windowStart] })],
);
