import type { Locale } from "~/i18n/config";
import { localePath, locales } from "~/i18n/config";
import type { SeoRepository, SitemapUrlRecord } from "~/platform/ports";
import { absoluteUrl } from "./structured-data";
import {
  creatorPath,
  policyPath,
  taxonomyPath,
  themePath,
} from "./meta.server";

const POLICY_PAGES = ["terms", "privacy", "copyright", "about"] as const;

export type SeoService = {
  buildSitemapXml(origin: string): Promise<string>;
  buildRobotsTxt(origin: string): string;
};

function formatLastmod(updatedAt: number | null | undefined): string | null {
  if (updatedAt == null || !Number.isFinite(updatedAt)) return null;
  return new Date(updatedAt).toISOString().slice(0, 10);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function urlEntry(loc: string, lastmod: string | null): string {
  const lines = [`  <url>`, `    <loc>${escapeXml(loc)}</loc>`];
  if (lastmod) {
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
  }
  lines.push(`  </url>`);
  return lines.join("\n");
}

function collectLocaleRoots(origin: string, now: number): SitemapUrlRecord[] {
  return locales.map((locale) => ({
    loc: absoluteUrl(origin, localePath(locale)),
    lastmod: now,
  }));
}

function collectPolicyUrls(origin: string, now: number): SitemapUrlRecord[] {
  const urls: SitemapUrlRecord[] = [];
  for (const locale of locales) {
    for (const page of POLICY_PAGES) {
      urls.push({
        loc: absoluteUrl(origin, policyPath(locale, page)),
        lastmod: now,
      });
    }
  }
  return urls;
}

function expandThemeUrls(
  origin: string,
  themes: Array<{
    slug: string;
    updatedAt: number;
    locales: Locale[];
  }>,
): SitemapUrlRecord[] {
  const urls: SitemapUrlRecord[] = [];
  for (const theme of themes) {
    for (const locale of theme.locales) {
      urls.push({
        loc: absoluteUrl(origin, themePath(locale, theme.slug)),
        lastmod: theme.updatedAt,
      });
    }
  }
  return urls;
}

function expandCreatorUrls(
  origin: string,
  creators: Array<{ handle: string; updatedAt: number }>,
): SitemapUrlRecord[] {
  const urls: SitemapUrlRecord[] = [];
  for (const creator of creators) {
    for (const locale of locales) {
      urls.push({
        loc: absoluteUrl(origin, creatorPath(locale, creator.handle)),
        lastmod: creator.updatedAt,
      });
    }
  }
  return urls;
}

function expandTaxonomyUrls(
  origin: string,
  taxonomies: Array<{
    dimension: string;
    key: string;
    updatedAt: number;
  }>,
): SitemapUrlRecord[] {
  const urls: SitemapUrlRecord[] = [];
  for (const taxonomy of taxonomies) {
    for (const locale of locales) {
      urls.push({
        loc: absoluteUrl(
          origin,
          taxonomyPath(locale, taxonomy.dimension, taxonomy.key),
        ),
        lastmod: taxonomy.updatedAt,
      });
    }
  }
  return urls;
}

export function renderSitemapXml(urls: SitemapUrlRecord[]): string {
  const entries = urls
    .map((entry) => urlEntry(entry.loc, formatLastmod(entry.lastmod)))
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    entries,
    `</urlset>`,
    ``,
  ].join("\n");
}

export function buildRobotsTxt(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return [
    `User-agent: *`,
    `Allow: /`,
    ``,
    `Sitemap: ${base}/sitemap.xml`,
    ``,
  ].join("\n");
}

export function createSeoService(repo: SeoRepository): SeoService {
  return {
    async buildSitemapXml(origin: string) {
      const now = Date.now();
      const [themes, creators, taxonomies] = await Promise.all([
        repo.listIndexableThemes(),
        repo.listIndexableCreators(),
        repo.listIndexableTaxonomies(),
      ]);

      const urls: SitemapUrlRecord[] = [
        ...collectLocaleRoots(origin, now),
        ...expandThemeUrls(origin, themes),
        ...expandCreatorUrls(origin, creators),
        ...expandTaxonomyUrls(origin, taxonomies),
        ...collectPolicyUrls(origin, now),
      ];

      // De-dupe by loc while preserving first lastmod.
      const seen = new Set<string>();
      const unique = urls.filter((entry) => {
        if (seen.has(entry.loc)) return false;
        seen.add(entry.loc);
        return true;
      });

      return renderSitemapXml(unique);
    },

    buildRobotsTxt(origin: string) {
      return buildRobotsTxt(origin);
    },
  };
}
