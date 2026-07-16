import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

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
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const themes = sqliteTable("themes", {
  id: text("id").primaryKey(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  slug: text("slug").notNull().unique(),
  sourceLocale: text("source_locale", { enum: ["en", "zh-hans"] }).notNull(),
  currentVersion: integer("current_version"),
  visibility: text("visibility", {
    enum: ["draft", "public", "unlisted", "hidden"],
  }).notNull(),
  moderationStatus: text("moderation_status", {
    enum: ["clean", "flagged", "removed"],
  }).notNull(),
  packageStatus: text("package_status", {
    enum: ["processing", "ready", "failed"],
  }).notNull(),
  favoritesCount: integer("favorites_count").notNull().default(0),
  downloadsCount: integer("downloads_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const themeVersions = sqliteTable(
  "theme_versions",
  {
    id: text("id").primaryKey(),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id),
    version: integer("version").notNull(),
    manifestJson: text("manifest_json").notNull(),
    packageKey: text("package_key"),
    payloadDigest: text("payload_digest"),
    archiveDigest: text("archive_digest"),
    publishedAt: integer("published_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [unique().on(table.themeId, table.version)],
);

export const themeTranslations = sqliteTable(
  "theme_translations",
  {
    id: text("id").primaryKey(),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id),
    locale: text("locale", { enum: ["en", "zh-hans"] }).notNull(),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    translationStatus: text("translation_status", {
      enum: ["draft", "reviewed"],
    })
      .notNull()
      .default("draft"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [unique().on(table.themeId, table.locale)],
);

export const taxonomies = sqliteTable(
  "taxonomies",
  {
    id: text("id").primaryKey(),
    dimension: text("dimension").notNull(),
    key: text("key").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [unique().on(table.dimension, table.key)],
);

export const taxonomyTranslations = sqliteTable(
  "taxonomy_translations",
  {
    id: text("id").primaryKey(),
    taxonomyId: text("taxonomy_id")
      .notNull()
      .references(() => taxonomies.id),
    locale: text("locale", { enum: ["en", "zh-hans"] }).notNull(),
    label: text("label").notNull(),
    synonymsJson: text("synonyms_json").notNull().default("[]"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [unique().on(table.taxonomyId, table.locale)],
);

export const themeTaxonomies = sqliteTable(
  "theme_taxonomies",
  {
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id),
    taxonomyId: text("taxonomy_id")
      .notNull()
      .references(() => taxonomies.id),
  },
  (table) => [primaryKey({ columns: [table.themeId, table.taxonomyId] })],
);
