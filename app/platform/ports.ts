import type { Locale } from "~/i18n/config";
import type {
  CreatorProfile,
  MarketplaceFilters,
  TaxonomyHubRecord,
  ThemeDetail,
  ThemeListItem,
  ThemeListResult,
} from "~/services/marketplace/types";

export interface MarketplaceRepository {
  list(locale: Locale, filters: MarketplaceFilters): Promise<ThemeListResult>;

  findBySlug(slug: string, locale: Locale): Promise<ThemeDetail | null>;

  findCreator(handle: string, locale: Locale): Promise<CreatorProfile | null>;

  findRelated(
    slug: string,
    locale: Locale,
    limit?: number,
  ): Promise<ThemeListItem[]>;

  findTaxonomy(
    dimension: string,
    key: string,
    locale: Locale,
  ): Promise<TaxonomyHubRecord | null>;
}

export type SitemapUrlRecord = {
  loc: string;
  lastmod: number | null;
};

/**
 * Raw theme candidates for sitemap assembly.
 * Indexability is decided in the SEO service layer (not platform).
 */
export type ThemeSitemapCandidate = {
  slug: string;
  updatedAt: number;
  visibility: "draft" | "public" | "unlisted" | "hidden";
  moderationStatus: "clean" | "flagged" | "removed";
  packageStatus: "processing" | "ready" | "failed";
  translationStatus: Partial<Record<Locale, "draft" | "reviewed">>;
};

/**
 * Raw creator candidates with per-locale public inventory.
 * A locale is sitemap-eligible only when publicThemeCountByLocale[locale] > 0.
 */
export type CreatorSitemapCandidate = {
  handle: string;
  updatedAt: number;
  publicThemeCountByLocale: Partial<Record<Locale, number>>;
};

/**
 * Raw taxonomy candidates with translation coverage and per-locale inventory.
 * Indexable only when the locale has a translation and publicThemeCount > 0.
 */
export type TaxonomySitemapCandidate = {
  dimension: string;
  key: string;
  updatedAt: number;
  localesWithTranslation: Locale[];
  publicThemeCountByLocale: Partial<Record<Locale, number>>;
};

export interface SeoRepository {
  /** Public-ready theme rows with translation status (no index-policy filtering). */
  listThemeSitemapCandidates(): Promise<ThemeSitemapCandidate[]>;
  /** Creators with at least one public-ready theme in some locale. */
  listCreatorSitemapCandidates(): Promise<CreatorSitemapCandidate[]>;
  /** Controlled taxonomies with translation + inventory metadata. */
  listTaxonomySitemapCandidates(): Promise<TaxonomySitemapCandidate[]>;
}
