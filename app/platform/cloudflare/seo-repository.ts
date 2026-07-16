import { and, eq, ne, sql } from "drizzle-orm";

import { createDb, type Db } from "~/db/client.server";
import {
  taxonomies,
  taxonomyTranslations,
  themeTaxonomies,
  themeTranslations,
  themes,
  users,
} from "~/db/schema";
import { isPubliclyListable } from "~/domain/themes/state";
import type { Locale } from "~/i18n/config";
import type {
  CreatorSitemapCandidate,
  LandingSitemapCandidate,
  SeoRepository,
  TaxonomySitemapCandidate,
  ThemeSitemapCandidate,
} from "~/platform/ports";
import { seoLandings, seoLandingTranslations } from "~/db/schema";

export class CloudflareSeoRepository implements SeoRepository {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async listThemeSitemapCandidates(): Promise<ThemeSitemapCandidate[]> {
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

    const entries: ThemeSitemapCandidate[] = [];

    for (const theme of themeRows) {
      if (!isPubliclyListable(theme)) continue;

      const translations = translationsByTheme.get(theme.id) ?? [];
      const translationStatus: Partial<Record<Locale, "draft" | "reviewed">> =
        {};
      let latestUpdate = theme.updatedAt;

      for (const translation of translations) {
        translationStatus[translation.locale] = translation.translationStatus;
        if (translation.updatedAt > latestUpdate) {
          latestUpdate = translation.updatedAt;
        }
      }

      entries.push({
        slug: theme.slug,
        updatedAt: latestUpdate,
        visibility: theme.visibility,
        moderationStatus: theme.moderationStatus,
        packageStatus: theme.packageStatus,
        translationStatus,
      });
    }

    return entries;
  }

  async listCreatorSitemapCandidates(): Promise<CreatorSitemapCandidate[]> {
    // Per-locale public ready reviewed theme counts for each creator.
    const rows = await this.db
      .select({
        handle: users.handle,
        userUpdatedAt: users.updatedAt,
        locale: themeTranslations.locale,
        themeCount: sql<number>`count(${themes.id})`.mapWith(Number),
        latestThemeUpdate: sql<number>`max(${themes.updatedAt})`.mapWith(
          Number,
        ),
      })
      .from(users)
      .innerJoin(themes, eq(themes.authorId, users.id))
      .innerJoin(
        themeTranslations,
        and(
          eq(themeTranslations.themeId, themes.id),
          eq(themeTranslations.translationStatus, "reviewed"),
        ),
      )
      .where(
        and(
          eq(themes.visibility, "public"),
          ne(themes.moderationStatus, "removed"),
          eq(themes.packageStatus, "ready"),
        ),
      )
      .groupBy(users.id, themeTranslations.locale);

    const byHandle = new Map<string, CreatorSitemapCandidate>();

    for (const row of rows) {
      if (row.themeCount <= 0) continue;

      // users.updatedAt uses integer mode timestamp_ms (Date); themes stay number ms.
      const userUpdatedAtMs =
        row.userUpdatedAt instanceof Date
          ? row.userUpdatedAt.getTime()
          : Number(row.userUpdatedAt);

      const existing = byHandle.get(row.handle);
      if (existing) {
        existing.publicThemeCountByLocale[row.locale] = row.themeCount;
        existing.updatedAt = Math.max(
          existing.updatedAt,
          userUpdatedAtMs,
          row.latestThemeUpdate || 0,
        );
      } else {
        byHandle.set(row.handle, {
          handle: row.handle,
          updatedAt: Math.max(userUpdatedAtMs, row.latestThemeUpdate || 0),
          publicThemeCountByLocale: {
            [row.locale]: row.themeCount,
          },
        });
      }
    }

    return [...byHandle.values()];
  }

  async listTaxonomySitemapCandidates(): Promise<TaxonomySitemapCandidate[]> {
    const taxonomyRows = await this.db
      .select({
        id: taxonomies.id,
        dimension: taxonomies.dimension,
        key: taxonomies.key,
        updatedAt: taxonomies.updatedAt,
      })
      .from(taxonomies);

    if (taxonomyRows.length === 0) return [];

    const translationRows = await this.db
      .select({
        taxonomyId: taxonomyTranslations.taxonomyId,
        locale: taxonomyTranslations.locale,
      })
      .from(taxonomyTranslations);

    const localesByTaxonomy = new Map<string, Locale[]>();
    for (const row of translationRows) {
      const list = localesByTaxonomy.get(row.taxonomyId) ?? [];
      list.push(row.locale);
      localesByTaxonomy.set(row.taxonomyId, list);
    }

    // Public ready reviewed themes linked to each taxonomy, per locale.
    const inventoryRows = await this.db
      .select({
        taxonomyId: themeTaxonomies.taxonomyId,
        locale: themeTranslations.locale,
        themeCount: sql<number>`count(distinct ${themes.id})`.mapWith(Number),
        latestThemeUpdate: sql<number>`max(${themes.updatedAt})`.mapWith(
          Number,
        ),
      })
      .from(themeTaxonomies)
      .innerJoin(themes, eq(themes.id, themeTaxonomies.themeId))
      .innerJoin(
        themeTranslations,
        and(
          eq(themeTranslations.themeId, themes.id),
          eq(themeTranslations.translationStatus, "reviewed"),
        ),
      )
      .where(
        and(
          eq(themes.visibility, "public"),
          ne(themes.moderationStatus, "removed"),
          eq(themes.packageStatus, "ready"),
        ),
      )
      .groupBy(themeTaxonomies.taxonomyId, themeTranslations.locale);

    const inventoryByTaxonomy = new Map<
      string,
      { counts: Partial<Record<Locale, number>>; latest: number }
    >();

    for (const row of inventoryRows) {
      const entry = inventoryByTaxonomy.get(row.taxonomyId) ?? {
        counts: {},
        latest: 0,
      };
      entry.counts[row.locale] = row.themeCount;
      entry.latest = Math.max(entry.latest, row.latestThemeUpdate || 0);
      inventoryByTaxonomy.set(row.taxonomyId, entry);
    }

    return taxonomyRows.map((row) => {
      const inventory = inventoryByTaxonomy.get(row.id);
      return {
        dimension: row.dimension,
        key: row.key,
        updatedAt: Math.max(row.updatedAt, inventory?.latest ?? 0),
        localesWithTranslation: localesByTaxonomy.get(row.id) ?? [],
        publicThemeCountByLocale: inventory?.counts ?? {},
      };
    });
  }

  async listLandingSitemapCandidates(): Promise<LandingSitemapCandidate[]> {
    const rows = await this.db
      .select({
        slug: seoLandings.slug,
        locale: seoLandingTranslations.locale,
        updatedAt: seoLandingTranslations.updatedAt,
        rolloutBatch: seoLandings.rolloutBatch,
      })
      .from(seoLandings)
      .innerJoin(
        seoLandingTranslations,
        eq(seoLandingTranslations.landingId, seoLandings.id),
      )
      .where(
        and(
          eq(seoLandings.indexStatus, "approved"),
          eq(seoLandingTranslations.translationStatus, "reviewed"),
        ),
      );

    return rows.map((row) => ({
      slug: row.slug,
      locale: row.locale,
      updatedAt: row.updatedAt,
      rolloutBatch: row.rolloutBatch,
    }));
  }
}

export function createSeoRepository(d1: D1Database): SeoRepository {
  return new CloudflareSeoRepository(d1);
}
