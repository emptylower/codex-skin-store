import type { MarketplaceRepository } from "~/platform/ports";
import type { Locale } from "~/i18n/config";
import type { CreatorProfile } from "./types";

export async function getCreator(
  repo: MarketplaceRepository,
  handle: string,
  locale: Locale,
): Promise<CreatorProfile | null> {
  return repo.findCreator(handle, locale);
}
