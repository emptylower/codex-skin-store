import { z } from "zod";

import type { Locale } from "~/i18n/config";

export const marketplaceFilterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  platform: z.enum(["macos", "windows", "both"]).optional(),
  mode: z.enum(["light", "dark"]).optional(),
  media: z.enum(["static", "animated"]).optional(),
  taxonomy: z.array(z.string().max(40)).max(4).default([]),
  /** When set, taxonomy key filters must match this dimension (hub isolation). */
  taxonomyDimension: z
    .enum(["style", "mood", "mode", "media", "platform"])
    .optional(),
  sort: z.enum(["trending", "newest", "downloads"]).default("trending"),
});

export type MarketplaceFilters = z.infer<typeof marketplaceFilterSchema>;

export type MarketplacePlatform = "macos" | "windows" | "both";
export type MarketplaceMode = "light" | "dark";
export type MarketplaceMedia = "static" | "animated";

export type ThemeListPreview = {
  palette?: {
    bg?: string;
    fg?: string;
    accent?: string;
    muted?: string;
  };
  focalX?: number;
  focalY?: number;
  overlay?: number;
};

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
  /** Materialized trend score; 0 when not reconciled yet. */
  trendScore: number;
  creator: {
    handle: string;
    displayName: string;
  };
  previewImage: string | null;
  coverImage: string | null;
  /** Optional preview facts from manifest when available. */
  preview?: ThemeListPreview;
  taxonomyKeys: string[];
  /** Dimension+key pairs for hub filtering (keys alone can collide across dimensions). */
  taxonomies: Array<{ dimension: string; key: string }>;
  createdAt: number;
  updatedAt: number;
};

export type ThemeDetail = ThemeListItem & {
  description: string;
  locale: Locale;
  sourceLocale: Locale;
  currentVersion: number | null;
  packageKey: string | null;
  payloadDigest: string | null;
  archiveDigest: string | null;
  packageStatus: "processing" | "ready" | "failed";
  /** Public readiness flags for SEO index policy. */
  visibility: "draft" | "public" | "unlisted" | "hidden";
  moderationStatus: "clean" | "flagged" | "removed";
  /** Per-locale translation readiness for hreflang / index decisions. */
  translationStatus: Partial<Record<Locale, "draft" | "reviewed">>;
  /** Locales with reviewed translations (subset of translationStatus). */
  availableLocales: Locale[];
  manifest: Record<string, unknown>;
};

export type TaxonomyHubRecord = {
  dimension: string;
  key: string;
  label: string;
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
