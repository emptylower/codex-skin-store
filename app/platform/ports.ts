import type { Locale } from "~/i18n/config";
import type {
  CreatorProfile,
  MarketplaceFilters,
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
}
