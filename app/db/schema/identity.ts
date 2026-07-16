import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

/**
 * Extended users table shared by marketplace profiles and Better Auth.
 * Better Auth logical fields map via createAuth options:
 * name -> displayName, image -> avatarUrl (drizzle property names).
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  handle: text("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio").notNull().default(""),
  role: text("role", { enum: ["user", "moderator", "admin"] })
    .notNull()
    .default("user"),
  uploadStatus: text("upload_status", { enum: ["active", "suspended"] })
    .notNull()
    .default("active"),
  email: text("email"),
  // Better Auth expects boolean emailVerified; D1 stores 0/1 integers.
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  deletionStatus: text("deletion_status", {
    enum: ["active", "auth_cleanup_pending", "deleted"],
  })
    .notNull()
    .default("active"),
  // Plain unix-ms integers so marketplace/SEO numeric sorts stay stable.
  // Better Auth still accepts numeric timestamps for these core fields.
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [unique().on(table.providerId, table.accountId)],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});
