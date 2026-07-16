import { and, eq, ne, sql } from "drizzle-orm";

import { createDb, type Db } from "~/db/client.server";
import {
  taxonomies,
  themeTranslations,
  themes,
  users,
} from "~/db/schema";
import { isPubliclyListable } from "~/domain/themes/state";
import type { Locale } from "~/i18n/config";
import type {
  IndexableCreatorSitemapEntry,
  IndexableTaxonomySitemapEntry,
  IndexableThemeSitemapEntry,
  SeoRepository,
} from "~/platform/ports";
import { isIndexableTheme } from "~/services/seo/index-policy";

export class CloudflareSeoRepository implements SeoRepository {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async listIndexableThemes(): Promise<IndexableThemeSitemapEntry[]> {
    const themeRows = await this.db
      .select({
        id: themes.id,
        slug: themes.slug,
        updatedAt: themes.updatedAt,
        visibility: themes.visibility,
        moderationStatus: themes.moderationStatus,
        packageStatus: themes.packageStatus,
      })
      .from(themes)
      .where(
        and(
          eq(themes.visibility, "public"),
          ne(themes.moderationStatus, "removed"),
          eq(themes.packageStatus, "ready"),
        ),
      );

    if (themeRows.length === 0) return [];

    const translationRows = await this.db
      .select({
        themeId: themeTranslations.themeId,
        locale: themeTranslations.locale,
        translationStatus: themeTranslations.translationStatus,
        updatedAt: themeTranslations.updatedAt,
      })
      .from(themeTranslations);

    const translationsByTheme = new Map<
      string,
      Array<{
        locale: Locale;
        translationStatus: "draft" | "reviewed";
        updatedAt: number;
      }>
    >();

    for (const row of translationRows) {
      const list = translationsByTheme.get(row.themeId) ?? [];
      list.push({
        locale: row.locale,
        translationStatus: row.translationStatus,
        updatedAt: row.updatedAt,
      });
      translationsByTheme.set(row.themeId, list);
    }

    const entries: IndexableThemeSitemapEntry[] = [];

    for (const theme of themeRows) {
      if (!isPubliclyListable(theme)) continue;

      const translations = translationsByTheme.get(theme.id) ?? [];
      const translationStatus: Partial<Record<Locale, "draft" | "reviewed">> =
        {};
      let latestTranslationUpdate = theme.updatedAt;

      for (const translation of translations) {
        translationStatus[translation.locale] = translation.translationStatus;
        if (translation.updatedAt > latestTranslationUpdate) {
          latestTranslationUpdate = translation.updatedAt;
        }
      }

      const locales = (
        Object.entries(translationStatus) as Array<
          [Locale, "draft" | "reviewed"]
        >
      )
        .filter(([locale]) =>
          isIndexableTheme(
            {
              visibility: theme.visibility,
              moderationStatus: theme.moderationStatus,
              packageStatus: theme.packageStatus,
              translationStatus,
            },
            locale,
          ),
        )
        .map(([locale]) => locale);

      if (locales.length === 0) continue;

      entries.push({
        slug: theme.slug,
        updatedAt: latestTranslationUpdate,
        locales,
      });
    }

    return entries;
  }

  async listIndexableCreators(): Promise<IndexableCreatorSitemapEntry[]> {
    // Creators with at least one public ready theme.
    const rows = await this.db
      .select({
        handle: users.handle,
        updatedAt: users.updatedAt,
        themeCount: sql<number>`count(${themes.id})`.mapWith(Number),
        latestThemeUpdate: sql<number>`max(${themes.updatedAt})`.mapWith(
          Number,
        ),
      })
      .from(users)
      .innerJoin(themes, eq(themes.authorId, users.id))
      .where(
        and(
          eq(themes.visibility, "public"),
          ne(themes.moderationStatus, "removed"),
          eq(themes.packageStatus, "ready"),
        ),
      )
      .groupBy(users.id);

    return rows
      .filter((row) => row.themeCount > 0)
      .map((row) => ({
        handle: row.handle,
        updatedAt: Math.max(row.updatedAt, row.latestThemeUpdate || 0),
      }));
  }

  async listIndexableTaxonomies(): Promise<IndexableTaxonomySitemapEntry[]> {
    // Controlled taxonomies that exist are eligible as hub pages.
    const rows = await this.db
      .select({
        dimension: taxonomies.dimension,
        key: taxonomies.key,
        updatedAt: taxonomies.updatedAt,
      })
      .from(taxonomies);

    return rows.map((row) => ({
      dimension: row.dimension,
      key: row.key,
      updatedAt: row.updatedAt,
    }));
  }
}

export function createSeoRepository(d1: D1Database): SeoRepository {
  return new CloudflareSeoRepository(d1);
}
