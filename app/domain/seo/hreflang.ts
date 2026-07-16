import {
  defaultLocale,
  htmlLang,
  type Locale,
  locales,
} from "~/i18n/config";

export type TranslationVisibility = "draft" | "reviewed" | "stale" | "missing";

export type HreflangLink = {
  /** BCP 47 tag or x-default */
  hreflang: string;
  href: string;
  locale?: Locale;
};

export type LocalePathMap = Partial<Record<Locale, string>>;

/**
 * Build reciprocal hreflang set for a page.
 * Only include locales that are publicly indexable (typically reviewed).
 * Always self-references included locales; x-default points to English when present.
 */
export function buildHreflangParity(options: {
  origin: string;
  pathsByLocale: LocalePathMap;
  indexableByLocale: Partial<Record<Locale, boolean>>;
}): HreflangLink[] {
  const origin = options.origin.replace(/\/$/, "");
  const links: HreflangLink[] = [];

  for (const locale of locales) {
    const path = options.pathsByLocale[locale];
    const indexable = options.indexableByLocale[locale] === true;
    if (!path || !indexable) continue;
    links.push({
      hreflang: htmlLang(locale),
      href: `${origin}${path.startsWith("/") ? path : `/${path}`}`,
      locale,
    });
  }

  const english = links.find((link) => link.locale === defaultLocale);
  if (english) {
    links.push({
      hreflang: "x-default",
      href: english.href,
      locale: defaultLocale,
    });
  }

  return links;
}

/**
 * English must not claim a Chinese alternate when Chinese is draft/stale/missing.
 */
export function shouldEmitAlternate(
  status: TranslationVisibility | undefined,
): boolean {
  return status === "reviewed";
}

export function localeIndexPolicy(
  status: TranslationVisibility | undefined,
): "index" | "noindex" | "not_found" {
  if (status === "reviewed") return "index";
  if (status === "draft" || status === "stale") return "noindex";
  return "not_found";
}

export function assertReciprocal(links: HreflangLink[]): boolean {
  const localesPresent = new Set(
    links.filter((l) => l.hreflang !== "x-default").map((l) => l.locale),
  );
  // Every non-default link set should include self entries for each locale present.
  for (const locale of localesPresent) {
    const self = links.find(
      (l) => l.locale === locale && l.hreflang === htmlLang(locale!),
    );
    if (!self) return false;
  }
  const hasXDefault = links.some((l) => l.hreflang === "x-default");
  if (localesPresent.has(defaultLocale) && !hasXDefault) return false;
  return true;
}
