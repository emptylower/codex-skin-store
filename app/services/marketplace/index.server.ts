import type { MarketplaceRepository } from "~/platform/ports";
import type { Locale } from "~/i18n/config";
import { getCreator } from "./get-creator.server";
import { getTheme } from "./get-theme.server";
import { listThemes } from "./list-themes.server";
import { getRelatedThemes } from "./related-themes.server";
import type {
  CreatorProfile,
  MarketplaceFilters,
  TaxonomyHubRecord,
  ThemeDetail,
  ThemeListItem,
  ThemeListResult,
} from "./types";

export type MarketplaceService = {
  listThemes(
    locale: Locale,
    input?: Partial<MarketplaceFilters>,
  ): Promise<ThemeListResult>;
  getTheme(slug: string, locale: Locale): Promise<ThemeDetail | null>;
  getCreator(handle: string, locale: Locale): Promise<CreatorProfile | null>;
  getRelatedThemes(
    slug: string,
    locale: Locale,
    limit?: number,
  ): Promise<ThemeListItem[]>;
  getTaxonomy(
    dimension: string,
    key: string,
    locale: Locale,
  ): Promise<TaxonomyHubRecord | null>;
};

export function createMarketplaceService(
  repo: MarketplaceRepository,
): MarketplaceService {
  return {
    listThemes: (locale, input) => listThemes(repo, locale, input),
    getTheme: (slug, locale) => getTheme(repo, slug, locale),
    getCreator: (handle, locale) => getCreator(repo, handle, locale),
    getRelatedThemes: (slug, locale, limit) =>
      getRelatedThemes(repo, slug, locale, limit),
    getTaxonomy: (dimension, key, locale) =>
      repo.findTaxonomy(dimension, key, locale),
  };
}
