import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

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
    enum: ["candidate", "eligible", "excluded"],
  })
    .notNull()
    .default("candidate"),
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
      enum: ["draft", "reviewed"],
    })
      .notNull()
      .default("draft"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [unique().on(table.landingId, table.locale)],
);
