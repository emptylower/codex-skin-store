import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const SEO_INDEX_STATUSES = [
  "candidate",
  "approved",
  "paused",
  "retired",
] as const;
export type SeoIndexStatus = (typeof SEO_INDEX_STATUSES)[number];

export const SEO_ELIGIBILITY_STATUSES = [
  "candidate",
  "eligible",
  "excluded",
] as const;
export type SeoEligibilityStatus = (typeof SEO_ELIGIBILITY_STATUSES)[number];

export const TRANSLATION_STATUSES = ["draft", "reviewed", "stale"] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

/**
 * dimension and taxonomy_key are both-or-neither (SQL CHECK).
 * Taxonomy filter landings set both; non-filter landings leave both null.
 */
export const seoLandings = sqliteTable("seo_landings", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  dimension: text("dimension"),
  taxonomyKey: text("taxonomy_key"),
  eligibilityStatus: text("eligibility_status", {
    enum: SEO_ELIGIBILITY_STATUSES,
  })
    .notNull()
    .default("candidate"),
  indexStatus: text("index_status", {
    enum: SEO_INDEX_STATUSES,
  })
    .notNull()
    .default("candidate"),
  rolloutBatch: integer("rollout_batch"),
  eligibilityJson: text("eligibility_json").notNull().default("{}"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: integer("reviewed_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const seoLandingTranslations = sqliteTable(
  "seo_landing_translations",
  {
    id: text("id").primaryKey(),
    landingId: text("landing_id")
      .notNull()
      .references(() => seoLandings.id),
    locale: text("locale", { enum: ["en", "zh-hans"] }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    bodyMarkdown: text("body_markdown").notNull().default(""),
    translationStatus: text("translation_status", {
      enum: TRANSLATION_STATUSES,
    })
      .notNull()
      .default("draft"),
    intro: text("intro").notNull().default(""),
    faqJson: text("faq_json").notNull().default("[]"),
    seoTitle: text("seo_title").notNull().default(""),
    seoDescription: text("seo_description").notNull().default(""),
    uniquenessScore: real("uniqueness_score"),
    uniquenessJson: text("uniqueness_json").notNull().default("{}"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: integer("reviewed_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [unique().on(table.landingId, table.locale)],
);
