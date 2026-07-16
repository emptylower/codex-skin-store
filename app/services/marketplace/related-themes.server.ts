import type { MarketplaceRepository } from "~/platform/ports";
import type { Locale } from "~/i18n/config";
import type { ThemeListItem } from "./types";

export async function getRelatedThemes(
  repo: MarketplaceRepository,
  slug: string,
  locale: Locale,
  limit = 5,
): Promise<ThemeListItem[]> {
  return repo.findRelated(slug, locale, limit);
}
