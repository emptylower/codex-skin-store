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
  list(
    locale: Locale,
    filters: MarketplaceFilters,
  ): Promise<ThemeListResult>;

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

export type IndexableThemeSitemapEntry = {
  slug: string;
  updatedAt: number;
  /** Locales with reviewed translations that may be indexed. */
  locales: Locale[];
};

export type IndexableCreatorSitemapEntry = {
  handle: string;
  updatedAt: number;
};

export type IndexableTaxonomySitemapEntry = {
  dimension: string;
  key: string;
  updatedAt: number;
};

export interface SeoRepository {
  listIndexableThemes(): Promise<IndexableThemeSitemapEntry[]>;
  listIndexableCreators(): Promise<IndexableCreatorSitemapEntry[]>;
  listIndexableTaxonomies(): Promise<IndexableTaxonomySitemapEntry[]>;
}
