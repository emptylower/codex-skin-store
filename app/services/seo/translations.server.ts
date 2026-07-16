import type { Locale } from "~/i18n/config";
import {
  buildHreflangParity,
  localeIndexPolicy,
  shouldEmitAlternate,
  type TranslationVisibility,
} from "~/domain/seo/hreflang";

export type LandingTranslationRow = {
  locale: Locale;
  title: string;
  description: string;
  intro: string;
  faqJson: string;
  seoTitle: string;
  seoDescription: string;
  translationStatus: "draft" | "reviewed" | "stale";
  uniquenessScore: number | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
};

export function parseFaqCount(faqJson: string): number {
  try {
    const parsed = JSON.parse(faqJson) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function isReviewComplete(row: {
  title: string;
  intro: string;
  seoTitle: string;
  seoDescription: string;
  faqJson: string;
}): boolean {
  return (
    row.title.trim().length > 0 &&
    row.intro.trim().length > 0 &&
    row.seoTitle.trim().length > 0 &&
    row.seoDescription.trim().length > 0 &&
    parseFaqCount(row.faqJson) >= 2
  );
}

/**
 * Mark non-source locales stale when source prose changes.
 */
export async function markTranslationsStale(
  db: D1Database,
  landingId: string,
  sourceLocale: Locale,
  now = Date.now(),
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE seo_landing_translations
       SET translation_status = 'stale', updated_at = ?
       WHERE landing_id = ?
         AND locale != ?
         AND translation_status = 'reviewed'`,
    )
    .bind(now, landingId, sourceLocale)
    .run();
  return result.meta.changes ?? 0;
}

export async function approveTranslation(
  db: D1Database,
  input: {
    landingId: string;
    locale: Locale;
    reviewerId: string;
    now?: number;
  },
): Promise<void> {
  const now = input.now ?? Date.now();
  const row = await db
    .prepare(
      `SELECT title, intro, seo_title AS seoTitle, seo_description AS seoDescription,
              faq_json AS faqJson
       FROM seo_landing_translations
       WHERE landing_id = ? AND locale = ? LIMIT 1`,
    )
    .bind(input.landingId, input.locale)
    .first<{
      title: string;
      intro: string;
      seoTitle: string;
      seoDescription: string;
      faqJson: string;
    }>();

  if (!row || !isReviewComplete(row)) {
    throw new Error("translation_incomplete");
  }

  await db
    .prepare(
      `UPDATE seo_landing_translations
       SET translation_status = 'reviewed',
           reviewed_by = ?,
           reviewed_at = ?,
           updated_at = ?
       WHERE landing_id = ? AND locale = ?`,
    )
    .bind(input.reviewerId, now, now, input.landingId, input.locale)
    .run();
}

export function visibilityFromStatus(
  status: string | null | undefined,
): TranslationVisibility {
  if (status === "reviewed" || status === "draft" || status === "stale") {
    return status;
  }
  return "missing";
}

export function buildLandingHreflang(options: {
  origin: string;
  slug: string;
  statuses: Partial<Record<Locale, TranslationVisibility>>;
}): ReturnType<typeof buildHreflangParity> {
  const pathsByLocale: Partial<Record<Locale, string>> = {};
  const indexableByLocale: Partial<Record<Locale, boolean>> = {};

  for (const locale of ["en", "zh-hans"] as Locale[]) {
    const status = options.statuses[locale] ?? "missing";
    pathsByLocale[locale] = `/${locale}/l/${options.slug}`;
    indexableByLocale[locale] = shouldEmitAlternate(status);
  }

  return buildHreflangParity({
    origin: options.origin,
    pathsByLocale,
    indexableByLocale,
  });
}

export function publicLandingPolicy(status: TranslationVisibility) {
  return localeIndexPolicy(status);
}
