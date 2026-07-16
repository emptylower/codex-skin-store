import type { MarketplaceRepository } from "~/platform/ports";
import type { Locale } from "~/i18n/config";
import type { ThemeDetail } from "./types";

export async function getTheme(
  repo: MarketplaceRepository,
  slug: string,
  locale: Locale,
): Promise<ThemeDetail | null> {
  return repo.findBySlug(slug, locale);
}
