import type { Locale } from "~/i18n/config";
import { defaultLocale, htmlLang, localePath, locales } from "~/i18n/config";
import { absoluteUrl, type JsonLd } from "./structured-data";

export type SeoMetaDescriptor =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { tagName: "link"; rel: string; href: string; hreflang?: string }
  | { "script:ld+json": JsonLd | JsonLd[] };

export type HreflangAlternate = {
  /** App locale code (en | zh-hans) or special x-default marker handled separately. */
  locale: Locale;
  path: string;
};

/**
 * Map app locale to HTML/hreflang BCP 47 tag.
 * URL path uses zh-hans; hreflang uses zh-Hans.
 */
export function hreflangTag(locale: Locale): string {
  return htmlLang(locale);
}

export function buildCanonicalLink(
  origin: string,
  path: string,
): SeoMetaDescriptor {
  return {
    tagName: "link",
    rel: "canonical",
    href: absoluteUrl(origin, path),
  };
}

/**
 * Build hreflang alternates for available locales + x-default → English.
 * Only pass locales that are indexable/complete for the page.
 */
export function buildHreflangAlternates(
  origin: string,
  alternates: HreflangAlternate[],
  options?: { xDefaultPath?: string },
): SeoMetaDescriptor[] {
  const tags: SeoMetaDescriptor[] = alternates.map((entry) => ({
    tagName: "link",
    rel: "alternate",
    hreflang: hreflangTag(entry.locale),
    href: absoluteUrl(origin, entry.path),
  }));

  const xDefaultPath =
    options?.xDefaultPath ??
    alternates.find((entry) => entry.locale === defaultLocale)?.path;

  if (xDefaultPath) {
    tags.push({
      tagName: "link",
      rel: "alternate",
      hreflang: "x-default",
      href: absoluteUrl(origin, xDefaultPath),
    });
  }

  return tags;
}

export function buildRobotsMeta(
  indexable: boolean,
): SeoMetaDescriptor | null {
  if (indexable) return null;
  return { name: "robots", content: "noindex,follow" };
}

export function buildBasicMeta(options: {
  title: string;
  description: string;
  origin: string;
  canonicalPath: string;
  indexable?: boolean;
  /** Locale variants that should emit hreflang (path per locale). */
  alternates?: HreflangAlternate[];
  ogType?: string;
  structuredData?: JsonLd | JsonLd[];
}): SeoMetaDescriptor[] {
  const indexable = options.indexable ?? true;
  const tags: SeoMetaDescriptor[] = [
    { title: options.title },
    { name: "description", content: options.description },
    buildCanonicalLink(options.origin, options.canonicalPath),
  ];

  const robots = buildRobotsMeta(indexable);
  if (robots) tags.push(robots);

  if (options.alternates && options.alternates.length > 0) {
    tags.push(...buildHreflangAlternates(options.origin, options.alternates));
  }

  if (options.ogType) {
    tags.push({ property: "og:type", content: options.ogType });
    tags.push({ property: "og:title", content: options.title });
    tags.push({ property: "og:description", content: options.description });
    tags.push({
      property: "og:url",
      content: absoluteUrl(options.origin, options.canonicalPath),
    });
  }

  if (options.structuredData) {
    tags.push({ "script:ld+json": options.structuredData });
  }

  return tags;
}

/** Full bilingual alternates for a path template under every launch locale. */
export function bilingualAlternates(
  pathBuilder: (locale: Locale) => string,
): HreflangAlternate[] {
  return locales.map((locale) => ({
    locale,
    path: pathBuilder(locale),
  }));
}

export function localeRootAlternates(): HreflangAlternate[] {
  return bilingualAlternates((locale) => localePath(locale));
}

export function themePath(locale: Locale, slug: string): string {
  return localePath(locale, `/themes/${slug}`);
}

export function creatorPath(locale: Locale, handle: string): string {
  return localePath(locale, `/creators/${handle}`);
}

export function taxonomyPath(
  locale: Locale,
  dimension: string,
  key: string,
): string {
  return localePath(locale, `/taxonomies/${dimension}/${key}`);
}

export function policyPath(locale: Locale, page: string): string {
  return localePath(locale, `/${page}`);
}
