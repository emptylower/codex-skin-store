import type { MarketplaceRepository } from "~/platform/ports";
import type { Locale } from "~/i18n/config";
import {
  marketplaceFilterSchema,
  type MarketplaceFilters,
  type ThemeListResult,
} from "./types";

export async function listThemes(
  repo: MarketplaceRepository,
  locale: Locale,
  input: Partial<MarketplaceFilters> = {},
): Promise<ThemeListResult> {
  const filters = marketplaceFilterSchema.parse(input);
  return repo.list(locale, filters);
}
