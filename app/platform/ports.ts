import type { Locale } from "~/i18n/config";
import type {
  CreatorProfile,
  MarketplaceFilters,
  TaxonomyHubRecord,
  ThemeDetail,
  ThemeListItem,
  ThemeListResult,
} from "~/services/marketplace/types";

export interface MarketplaceRepository {
  list(locale: Locale, filters: MarketplaceFilters): Promise<ThemeListResult>;

  findBySlug(slug: string, locale: Locale): Promise<ThemeDetail | null>;

  findCreator(handle: string, locale: Locale): Promise<CreatorProfile | null>;

  findRelated(
    slug: string,
    locale: Locale,
    limit?: number,
  ): Promise<ThemeListItem[]>;

  findTaxonomy(
    dimension: string,
    key: string,
    locale: Locale,
  ): Promise<TaxonomyHubRecord | null>;
}

export type SitemapUrlRecord = {
  loc: string;
  lastmod: number | null;
};

/**
 * Raw theme candidates for sitemap assembly.
 * Indexability is decided in the SEO service layer (not platform).
 */
export type ThemeSitemapCandidate = {
  slug: string;
  updatedAt: number;
  visibility: "draft" | "public" | "unlisted" | "hidden";
  moderationStatus: "clean" | "flagged" | "removed";
  packageStatus: "processing" | "ready" | "failed";
  translationStatus: Partial<Record<Locale, "draft" | "reviewed">>;
};

/**
 * Raw creator candidates with per-locale public inventory.
 * A locale is sitemap-eligible only when publicThemeCountByLocale[locale] > 0.
 */
export type CreatorSitemapCandidate = {
  handle: string;
  updatedAt: number;
  publicThemeCountByLocale: Partial<Record<Locale, number>>;
};

/**
 * Raw taxonomy candidates with translation coverage and per-locale inventory.
 * Indexable only when the locale has a translation and publicThemeCount > 0.
 */
export type TaxonomySitemapCandidate = {
  dimension: string;
  key: string;
  updatedAt: number;
  localesWithTranslation: Locale[];
  publicThemeCountByLocale: Partial<Record<Locale, number>>;
};

export interface SeoRepository {
  /** Public-ready theme rows with translation status (no index-policy filtering). */
  listThemeSitemapCandidates(): Promise<ThemeSitemapCandidate[]>;
  /** Creators with at least one public-ready theme in some locale. */
  listCreatorSitemapCandidates(): Promise<CreatorSitemapCandidate[]>;
  /** Controlled taxonomies with translation + inventory metadata. */
  listTaxonomySitemapCandidates(): Promise<TaxonomySitemapCandidate[]>;
}

/** R2 object head result for quarantine verification. */
export type SourceObjectHead = {
  size: number;
  etag: string;
  customMetadata: Record<string, string>;
};

export type SourcePutOptions = {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

export type MoveQuarantineToSourceInput = {
  quarantineKey: string;
  sourceKey: string;
  sha256: string;
  contentType: string;
};

/**
 * Private SOURCES bucket operations used by upload completion and package build.
 * Tests inject an in-memory implementation.
 */
export interface SourceObjectStore {
  head(key: string): Promise<SourceObjectHead | null>;
  delete(key: string): Promise<void>;
  /** Optional: read object bytes (package builder). */
  get?(key: string): Promise<Uint8Array | null>;
  /** Optional: put immutable source bytes. */
  put?(
    key: string,
    body: Uint8Array,
    options?: SourcePutOptions,
  ): Promise<void>;
  /**
   * Promote quarantine object to immutable source key (copy + delete).
   * Idempotent when source already exists with matching sha256.
   */
  moveQuarantineToSource?(input: MoveQuarantineToSourceInput): Promise<void>;
}

export type PresignPutInput = {
  key: string;
  contentType: string;
  uploadId: string;
  expectedBytes: number;
  expiresSeconds?: number;
};

export type PresignPutResult = {
  url: string;
  headers: Record<string, string>;
};

/** Signs a direct browser PUT to a quarantine key (no cookies). */
export interface ObjectPresigner {
  signPut(input: PresignPutInput): Promise<PresignPutResult>;
}

export type PackageQueueMessage = {
  jobId: string;
  idempotencyKey: string;
};

/** PACKAGE_QUEUE producer used after idempotent package_jobs insert. */
export interface PackageQueue {
  send(
    message: PackageQueueMessage,
    options?: { delaySeconds?: number },
  ): Promise<void>;
}
