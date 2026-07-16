export const locales = ["en", "zh-hans"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function parseLocale(value: string): Locale | null {
  return locales.includes(value as Locale) ? (value as Locale) : null;
}

export function localePath(locale: Locale, path = "") {
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Map app locale codes to BCP 47 language tags for the html lang attribute. */
export function htmlLang(locale: Locale): string {
  if (locale === "zh-hans") return "zh-Hans";
  return locale;
}

/**
 * Negotiate launch locale from Accept-Language.
 * Prefers zh-hans when the primary tag starts with "zh" (case-insensitive).
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  const primary = acceptLanguage.split(",")[0]?.trim().toLowerCase() ?? "";
  if (primary.startsWith("zh")) return "zh-hans";
  return defaultLocale;
}
