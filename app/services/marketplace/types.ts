import { z } from "zod";

import type { Locale } from "~/i18n/config";

export const marketplaceFilterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  platform: z.enum(["macos", "windows", "both"]).optional(),
  mode: z.enum(["light", "dark"]).optional(),
  media: z.enum(["static", "animated"]).optional(),
  taxonomy: z.array(z.string().max(40)).max(4).default([]),
  sort: z.enum(["trending", "newest", "downloads"]).default("trending"),
});

export type MarketplaceFilters = z.infer<typeof marketplaceFilterSchema>;

export type MarketplacePlatform = "macos" | "windows" | "both";
export type MarketplaceMode = "light" | "dark";
export type MarketplaceMedia = "static" | "animated";

export type ThemeListItem = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  platform: MarketplacePlatform;
  mode: MarketplaceMode;
  media: MarketplaceMedia;
  favoritesCount: number;
  downloadsCount: number;
  creator: {
    handle: string;
    displayName: string;
  };
  previewImage: string | null;
  coverImage: string | null;
  taxonomyKeys: string[];
  createdAt: number;
  updatedAt: number;
};

export type ThemeDetail = ThemeListItem & {
  description: string;
  locale: Locale;
  sourceLocale: Locale;
  currentVersion: number | null;
  packageKey: string | null;
  manifest: Record<string, unknown>;
};

export type CreatorProfile = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  themes: ThemeListItem[];
};

export type ThemeListResult = {
  items: ThemeListItem[];
};
