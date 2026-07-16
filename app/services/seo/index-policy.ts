import type { Locale } from "~/i18n/config";
import type { MarketplaceFilters } from "~/services/marketplace/types";

export type ThemeSeoRecord = {
  visibility: "draft" | "public" | "unlisted" | "hidden";
  moderationStatus: "clean" | "flagged" | "removed";
  packageStatus: "processing" | "ready" | "failed";
  translationStatus: Partial<Record<Locale, "draft" | "reviewed">>;
};

export type CreatorSeoRecord = {
  publicThemeCount: number;
};

export type TaxonomySeoRecord = {
  exists: boolean;
  dimension: string;
  key: string;
  /** Public ready themes in the current locale for this hub. Empty hubs are noindex. */
  publicThemeCount: number;
};

export function isIndexableTheme(
  theme: ThemeSeoRecord,
  locale: Locale,
): boolean {
  return (
    theme.visibility === "public" &&
    theme.moderationStatus !== "removed" &&
    theme.packageStatus === "ready" &&
    theme.translationStatus[locale] === "reviewed"
  );
}

/**
 * Marketplace roots are indexable only without query/filter state.
 * Default sort "trending" is treated as the clean root (not a filter).
 */
export function isIndexableMarketplace(
  filters: Partial<MarketplaceFilters> | null | undefined,
): boolean {
  if (!filters) return true;

  if (filters.q && filters.q.trim().length > 0) return false;
  if (filters.platform) return false;
  if (filters.mode) return false;
  if (filters.media) return false;
  if (filters.taxonomy && filters.taxonomy.length > 0) return false;
  if (filters.taxonomyDimension) return false;
  if (filters.sort && filters.sort !== "trending") return false;

  return true;
}

export function isIndexableCreator(creator: CreatorSeoRecord): boolean {
  return creator.publicThemeCount > 0;
}

/**
 * Taxonomy hubs are indexable only when they exist as controlled dimensions
 * and have at least one public theme in the locale being evaluated.
 */
export function isIndexableTaxonomy(taxonomy: TaxonomySeoRecord): boolean {
  return (
    taxonomy.exists &&
    taxonomy.dimension.length > 0 &&
    taxonomy.key.length > 0 &&
    taxonomy.publicThemeCount > 0
  );
}
