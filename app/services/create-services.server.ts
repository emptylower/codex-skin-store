import { createMarketplaceRepository } from "~/platform/cloudflare/marketplace-repository";
import {
  createMarketplaceService,
  type MarketplaceService,
} from "~/services/marketplace/index.server";

export type AppServices = {
  marketplace: MarketplaceService;
};

export function createServices(env: { DB: D1Database }): AppServices {
  const marketplaceRepo = createMarketplaceRepository(env.DB);
  return {
    marketplace: createMarketplaceService(marketplaceRepo),
  };
}
