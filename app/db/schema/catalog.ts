import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

// Identity owns the users table mapping (extended for Better Auth).
export { users } from "./identity";
import { users } from "./identity";

export const themes = sqliteTable("themes", {
  id: text("id").primaryKey(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  slug: text("slug").notNull().unique(),
  sourceLocale: text("source_locale", { enum: ["en", "zh-hans"] }).notNull(),
  /**
   * App invariant: null or an existing theme_versions.version for this theme.
   * Composite FK is deferred until the publish path can maintain it atomically.
   */
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
  trendScore: integer("trend_score").notNull().default(0),
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
    // Creator pipeline columns (migration 0002).
    creatorInputJson: text("creator_input_json"),
    generationState: text("generation_state", {
      enum: ["awaiting_upload", "queued", "processing", "ready", "failed"],
    })
      .notNull()
      .default("ready"),
    sourceKey: text("source_key"),
    sourceFilename: text("source_filename"),
    sourceMime: text("source_mime"),
    sourceBytes: integer("source_bytes"),
    sourceWidth: integer("source_width"),
    sourceHeight: integer("source_height"),
    sourceSha256: text("source_sha256"),
    previewKey: text("preview_key"),
    previewBytes: integer("preview_bytes"),
    previewSha256: text("preview_sha256"),
    manifestKey: text("manifest_key"),
    macosAdapterKey: text("macos_adapter_key"),
    windowsAdapterKey: text("windows_adapter_key"),
    installKey: text("install_key"),
    promptKey: text("prompt_key"),
    archiveBytes: integer("archive_bytes"),
    generatedAt: integer("generated_at"),
    generationErrorCode: text("generation_error_code"),
    generationErrorDetail: text("generation_error_detail"),
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

/** Controlled launch dimensions: style/mood/mode (seed) + media/platform (filters). */
export const TAXONOMY_DIMENSIONS = [
  "style",
  "mood",
  "mode",
  "media",
  "platform",
] as const;

export type TaxonomyDimension = (typeof TAXONOMY_DIMENSIONS)[number];

export const taxonomies = sqliteTable(
  "taxonomies",
  {
    id: text("id").primaryKey(),
    dimension: text("dimension", {
      enum: TAXONOMY_DIMENSIONS,
    }).notNull(),
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
