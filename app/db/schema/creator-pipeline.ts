import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { users } from "./identity";

export const sourceUploads = sqliteTable(
  "source_uploads",
  {
    id: text("id").primaryKey(),
    themeId: text("theme_id").notNull(),
    version: integer("version").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    quarantineKey: text("quarantine_key").notNull().unique(),
    declaredContentType: text("declared_content_type").notNull(),
    expectedBytes: integer("expected_bytes").notNull(),
    state: text("state", {
      enum: ["issued", "completed", "rejected"],
    }).notNull(),
    r2Etag: text("r2_etag"),
    expiresAt: integer("expires_at").notNull(),
    completedAt: integer("completed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [unique().on(table.themeId, table.version)],
);

export const packageJobs = sqliteTable("package_jobs", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  themeId: text("theme_id").notNull(),
  version: integer("version").notNull(),
  state: text("state", {
    enum: ["queued", "leased", "succeeded", "failed"],
  }).notNull(),
  attempt: integer("attempt").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  availableAt: integer("available_at").notNull(),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: integer("lease_expires_at"),
  lastErrorCode: text("last_error_code"),
  lastErrorDetail: text("last_error_detail"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  finishedAt: integer("finished_at"),
});
