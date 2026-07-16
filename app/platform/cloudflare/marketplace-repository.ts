import { and, eq, inArray, ne } from "drizzle-orm";

import { createDb, type Db } from "~/db/client.server";
import {
  themeTaxonomies,
  themeTranslations,
  themeVersions,
  themes,
  taxonomies,
  taxonomyTranslations,
  users,
} from "~/db/schema";
import { normalizeTaxonomyInput } from "~/domain/taxonomy/normalize";
import { isPubliclyListable } from "~/domain/themes/state";
import type { Locale } from "~/i18n/config";
import type { MarketplaceRepository } from "~/platform/ports";
import type {
  CreatorProfile,
  MarketplaceFilters,
  MarketplaceMedia,
  MarketplaceMode,
  MarketplacePlatform,
  TaxonomyHubRecord,
  ThemeDetail,
  ThemeListItem,
  ThemeListResult,
} from "~/services/marketplace/types";

type ManifestFacts = {
  platform: MarketplacePlatform;
  mode: MarketplaceMode;
  media: MarketplaceMedia;
  previewImage: string | null;
  coverImage: string | null;
  preview?: ThemeListItem["preview"];
  raw: Record<string, unknown>;
};

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readPreviewFromManifest(
  parsed: Record<string, unknown>,
): ThemeListItem["preview"] | undefined {
  const paletteRaw = parsed.palette;
  let palette:
    | {
        bg?: string;
        fg?: string;
        accent?: string;
        muted?: string;
      }
    | undefined;
  if (paletteRaw && typeof paletteRaw === "object" && !Array.isArray(paletteRaw)) {
    const p = paletteRaw as Record<string, unknown>;
    palette = {
      bg: typeof p.bg === "string" ? p.bg : undefined,
      fg: typeof p.fg === "string" ? p.fg : undefined,
      accent: typeof p.accent === "string" ? p.accent : undefined,
      muted: typeof p.muted === "string" ? p.muted : undefined,
    };
  }

  let focalX: number | undefined;
  let focalY: number | undefined;
  const focalRaw = parsed.focalPoint;
  if (focalRaw && typeof focalRaw === "object" && !Array.isArray(focalRaw)) {
    const f = focalRaw as Record<string, unknown>;
    focalX = readOptionalNumber(f.x);
    focalY = readOptionalNumber(f.y);
  }
  if (focalX === undefined) {
    focalX = readOptionalNumber(parsed.focalX);
  }
  if (focalY === undefined) {
    focalY = readOptionalNumber(parsed.focalY);
  }

  const overlay = readOptionalNumber(parsed.overlay);

  if (!palette && focalX === undefined && focalY === undefined && overlay === undefined) {
    return undefined;
  }

  return {
    palette,
    focalX,
    focalY,
    overlay,
  };
}

/**
 * Parse marketplace facts from theme_versions.manifest_json.
 * Fail closed: missing/invalid platform, mode, or media yields null so the
 * theme is excluded from public list/detail rather than defaulted.
 */
function parseManifest(manifestJson: string): ManifestFacts | null {
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(manifestJson) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  const platformRaw = parsed.platform;
  if (
    platformRaw !== "macos" &&
    platformRaw !== "windows" &&
    platformRaw !== "both"
  ) {
    return null;
  }
  const platform: MarketplacePlatform = platformRaw;

  const modeRaw = parsed.mode;
  if (modeRaw !== "light" && modeRaw !== "dark") {
    return null;
  }
  const mode: MarketplaceMode = modeRaw;

  const mediaRaw = parsed.media;
  if (mediaRaw !== "animated" && mediaRaw !== "static") {
    return null;
  }
  const media: MarketplaceMedia = mediaRaw;

  const previewImage =
    typeof parsed.previewImage === "string" ? parsed.previewImage : null;
  const coverImage =
    typeof parsed.coverImage === "string" ? parsed.coverImage : null;
  const preview = readPreviewFromManifest(parsed);

  return { platform, mode, media, previewImage, coverImage, preview, raw: parsed };
}

function matchesPlatform(
  themePlatform: MarketplacePlatform,
  filter: MarketplacePlatform,
): boolean {
  if (filter === "both") {
    return themePlatform === "both";
  }
  return themePlatform === filter || themePlatform === "both";
}

/**
 * Map filter tokens to controlled taxonomy keys only.
 * Unknown tokens are dropped (no free-form fallback).
 */
function normalizeTaxonomyFilters(inputs: string[]): string[] {
  const keys = new Set<string>();
  for (const input of inputs) {
    const canonical = normalizeTaxonomyInput(input);
    if (canonical) {
      keys.add(canonical);
    }
  }
  return [...keys];
}

function hasTaxonomyFilterInput(inputs: string[]): boolean {
  return inputs.some((input) => input.trim().length > 0);
}

type JoinedThemeRow = {
  theme: typeof themes.$inferSelect;
  author: typeof users.$inferSelect;
  translation: typeof themeTranslations.$inferSelect;
  version: typeof themeVersions.$inferSelect | null;
};

export class CloudflareMarketplaceRepository implements MarketplaceRepository {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async list(
    locale: Locale,
    filters: MarketplaceFilters,
  ): Promise<ThemeListResult> {
    const rows = await this.loadPublicThemeRows(locale);
    const taxonomyByTheme = await this.loadTaxonomyKeys(
      rows.map((row) => row.theme.id),
    );

    let items = rows
      .map((row) => this.toListItem(row, taxonomyByTheme.get(row.theme.id) ?? []))
      .filter((item): item is ThemeListItem => item !== null);

    items = this.applyFilters(items, filters);

    return { items };
  }

  async findBySlug(slug: string, locale: Locale): Promise<ThemeDetail | null> {
    const rows = await this.db
      .select({
        theme: themes,
        author: users,
        translation: themeTranslations,
        version: themeVersions,
      })
      .from(themes)
      .innerJoin(users, eq(users.id, themes.authorId))
      .innerJoin(
        themeTranslations,
        and(
          eq(themeTranslations.themeId, themes.id),
          eq(themeTranslations.locale, locale),
          eq(themeTranslations.translationStatus, "reviewed"),
        ),
      )
      .leftJoin(
        themeVersions,
        and(
          eq(themeVersions.themeId, themes.id),
          eq(themeVersions.version, themes.currentVersion),
        ),
      )
      .where(eq(themes.slug, slug))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    if (!isPubliclyListable(row.theme)) return null;
    if (!row.version) return null;

    const taxonomyKeys =
      (await this.loadTaxonomyKeys([row.theme.id])).get(row.theme.id) ?? [];
    const listItem = this.toListItem(row, taxonomyKeys);
    if (!listItem) return null;

    const manifest = parseManifest(row.version.manifestJson);
    if (!manifest) return null;

    return {
      ...listItem,
      description: row.translation.description,
      locale,
      sourceLocale: row.theme.sourceLocale,
      currentVersion: row.theme.currentVersion,
      packageKey: row.version.packageKey,
      payloadDigest: row.version.payloadDigest,
      archiveDigest: row.version.archiveDigest,
      packageStatus: row.theme.packageStatus,
      manifest: manifest.raw,
    };
  }

  async findTaxonomy(
    dimension: string,
    key: string,
    locale: Locale,
  ): Promise<TaxonomyHubRecord | null> {
    const rows = await this.db
      .select({
        dimension: taxonomies.dimension,
        key: taxonomies.key,
        label: taxonomyTranslations.label,
      })
      .from(taxonomies)
      .innerJoin(
        taxonomyTranslations,
        and(
          eq(taxonomyTranslations.taxonomyId, taxonomies.id),
          eq(taxonomyTranslations.locale, locale),
        ),
      )
      .where(and(eq(taxonomies.dimension, dimension as never), eq(taxonomies.key, key)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      dimension: row.dimension,
      key: row.key,
      label: row.label,
    };
  }

  async findCreator(
    handle: string,
    locale: Locale,
  ): Promise<CreatorProfile | null> {
    const creatorRows = await this.db
      .select()
      .from(users)
      .where(eq(users.handle, handle))
      .limit(1);

    const creator = creatorRows[0];
    if (!creator) return null;

    const rows = await this.loadPublicThemeRows(locale, creator.id);
    const taxonomyByTheme = await this.loadTaxonomyKeys(
      rows.map((row) => row.theme.id),
    );

    const themeItems = rows
      .map((row) => this.toListItem(row, taxonomyByTheme.get(row.theme.id) ?? []))
      .filter((item): item is ThemeListItem => item !== null)
      .sort((a, b) => {
        if (b.downloadsCount !== a.downloadsCount) {
          return b.downloadsCount - a.downloadsCount;
        }
        return b.createdAt - a.createdAt;
      });

    return {
      id: creator.id,
      handle: creator.handle,
      displayName: creator.displayName,
      avatarUrl: creator.avatarUrl,
      bio: creator.bio,
      themes: themeItems,
    };
  }

  async findRelated(
    slug: string,
    locale: Locale,
    limit = 5,
  ): Promise<ThemeListItem[]> {
    const current = await this.findBySlug(slug, locale);
    if (!current) return [];

    const { items } = await this.list(locale, {
      taxonomy: [],
      sort: "trending",
    });

    const currentKeys = new Set(current.taxonomyKeys);
    const scored = items
      .filter((item) => item.slug !== current.slug)
      .map((item) => {
        let score = 0;
        for (const key of item.taxonomyKeys) {
          if (currentKeys.has(key)) score += 2;
        }
        if (item.platform === current.platform) score += 1;
        if (item.mode === current.mode) score += 1;
        if (item.media === current.media) score += 1;
        return { item, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.item.downloadsCount !== a.item.downloadsCount) {
          return b.item.downloadsCount - a.item.downloadsCount;
        }
        return b.item.createdAt - a.item.createdAt;
      })
      .slice(0, limit)
      .map((entry) => entry.item);

    return scored;
  }

  private async loadPublicThemeRows(
    locale: Locale,
    authorId?: string,
  ): Promise<JoinedThemeRow[]> {
    const conditions = [
      eq(themes.visibility, "public"),
      ne(themes.moderationStatus, "removed"),
      eq(themes.packageStatus, "ready"),
      eq(themeTranslations.locale, locale),
      eq(themeTranslations.translationStatus, "reviewed"),
    ];

    if (authorId) {
      conditions.push(eq(themes.authorId, authorId));
    }

    const rows = await this.db
      .select({
        theme: themes,
        author: users,
        translation: themeTranslations,
        version: themeVersions,
      })
      .from(themes)
      .innerJoin(users, eq(users.id, themes.authorId))
      .innerJoin(
        themeTranslations,
        and(
          eq(themeTranslations.themeId, themes.id),
          eq(themeTranslations.locale, locale),
          eq(themeTranslations.translationStatus, "reviewed"),
        ),
      )
      .leftJoin(
        themeVersions,
        and(
          eq(themeVersions.themeId, themes.id),
          eq(themeVersions.version, themes.currentVersion),
        ),
      )
      .where(and(...conditions));

    return rows.filter(
      (row) => isPubliclyListable(row.theme) && row.version !== null,
    );
  }

  private async loadTaxonomyKeys(
    themeIds: string[],
  ): Promise<Map<string, Array<{ dimension: string; key: string }>>> {
    const map = new Map<string, Array<{ dimension: string; key: string }>>();
    if (themeIds.length === 0) return map;

    const rows = await this.db
      .select({
        themeId: themeTaxonomies.themeId,
        dimension: taxonomies.dimension,
        key: taxonomies.key,
      })
      .from(themeTaxonomies)
      .innerJoin(taxonomies, eq(taxonomies.id, themeTaxonomies.taxonomyId))
      .where(inArray(themeTaxonomies.themeId, themeIds));

    for (const row of rows) {
      const list = map.get(row.themeId) ?? [];
      list.push({ dimension: row.dimension, key: row.key });
      map.set(row.themeId, list);
    }

    return map;
  }

  private toListItem(
    row: JoinedThemeRow,
    taxonomiesForTheme: Array<{ dimension: string; key: string }>,
  ): ThemeListItem | null {
    if (!row.version) return null;
    if (!isPubliclyListable(row.theme)) return null;

    const manifest = parseManifest(row.version.manifestJson);
    if (!manifest) return null;

    return {
      id: row.theme.id,
      slug: row.theme.slug,
      name: row.translation.name,
      summary: row.translation.summary,
      platform: manifest.platform,
      mode: manifest.mode,
      media: manifest.media,
      favoritesCount: row.theme.favoritesCount,
      downloadsCount: row.theme.downloadsCount,
      creator: {
        handle: row.author.handle,
        displayName: row.author.displayName,
      },
      previewImage: manifest.previewImage,
      coverImage: manifest.coverImage,
      preview: manifest.preview,
      taxonomyKeys: taxonomiesForTheme.map((entry) => entry.key),
      taxonomies: taxonomiesForTheme,
      createdAt: row.theme.createdAt,
      updatedAt: row.theme.updatedAt,
    };
  }

  private applyFilters(
    items: ThemeListItem[],
    filters: MarketplaceFilters,
  ): ThemeListItem[] {
    let result = items;

    if (filters.platform) {
      result = result.filter((item) =>
        matchesPlatform(item.platform, filters.platform!),
      );
    }

    if (filters.mode) {
      result = result.filter((item) => item.mode === filters.mode);
    }

    if (filters.media) {
      result = result.filter((item) => item.media === filters.media);
    }

    // Strict controlled taxonomy: unknown tokens are dropped; if the caller
    // provided only unknown keys, match nothing (empty list).
    // When taxonomyDimension is set (taxonomy hubs), keys must match that dimension.
    if (hasTaxonomyFilterInput(filters.taxonomy)) {
      const taxonomyKeys = normalizeTaxonomyFilters(filters.taxonomy);
      if (taxonomyKeys.length === 0) {
        return [];
      }
      const dimension = filters.taxonomyDimension;
      result = result.filter((item) =>
        taxonomyKeys.every((key) =>
          dimension
            ? item.taxonomies.some(
                (entry) => entry.key === key && entry.dimension === dimension,
              )
            : item.taxonomyKeys.includes(key),
        ),
      );
    }

    if (filters.q) {
      const q = filters.q.toLowerCase();
      result = result.filter((item) => {
        return (
          item.name.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q) ||
          item.creator.handle.toLowerCase().includes(q) ||
          item.creator.displayName.toLowerCase().includes(q) ||
          item.taxonomyKeys.some((key) => key.toLowerCase().includes(q))
        );
      });
    }

    const sort = filters.sort ?? "trending";
    result = [...result].sort((a, b) => {
      if (sort === "newest") {
        return b.createdAt - a.createdAt;
      }
      if (sort === "downloads") {
        if (b.downloadsCount !== a.downloadsCount) {
          return b.downloadsCount - a.downloadsCount;
        }
        return b.createdAt - a.createdAt;
      }
      // trending: downloads then freshness (Plan 3 replaces with events)
      if (b.downloadsCount !== a.downloadsCount) {
        return b.downloadsCount - a.downloadsCount;
      }
      return b.createdAt - a.createdAt;
    });

    return result;
  }
}

export function createMarketplaceRepository(
  d1: D1Database,
): MarketplaceRepository {
  return new CloudflareMarketplaceRepository(d1);
}
