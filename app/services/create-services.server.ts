import { createMarketplaceRepository } from "~/platform/cloudflare/marketplace-repository";
import { createSeoRepository } from "~/platform/cloudflare/seo-repository";
import {
  createMarketplaceService,
  type MarketplaceService,
} from "~/services/marketplace/index.server";
import {
  createSeoService,
  type SeoService,
} from "~/services/seo/sitemap.server";

export type AppServices = {
  marketplace: MarketplaceService;
  seo: SeoService;
};

export function createServices(env: { DB: D1Database }): AppServices {
  const marketplaceRepo = createMarketplaceRepository(env.DB);
  const seoRepo = createSeoRepository(env.DB);
  return {
    marketplace: createMarketplaceService(marketplaceRepo),
    seo: createSeoService(seoRepo),
  };
}
