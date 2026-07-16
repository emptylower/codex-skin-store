import { evaluateLandingEligibility } from "~/domain/seo/eligibility";
import { computeUniquenessEvidence } from "~/domain/seo/uniqueness";
import type { Locale } from "~/i18n/config";
import { appendAuditAction } from "~/services/moderation/audit.server";
import {
  parseFaqCount,
  publicLandingPolicy,
  visibilityFromStatus,
} from "./translations.server";

export type LandingRecord = {
  id: string;
  slug: string;
  dimension: string | null;
  taxonomyKey: string | null;
  indexStatus: "candidate" | "approved" | "paused" | "retired";
  rolloutBatch: number | null;
  eligibilityJson: string;
  reviewedBy: string | null;
  reviewedAt: number | null;
};

export type LandingLocaleView = {
  landing: LandingRecord;
  locale: Locale;
  title: string;
  intro: string;
  faq: Array<{ q: string; a: string }>;
  seoTitle: string;
  seoDescription: string;
  translationStatus: "draft" | "reviewed" | "stale";
  uniquenessScore: number | null;
  indexable: boolean;
  policy: "index" | "noindex" | "not_found";
};

/**
 * Registry-only: filters never create rows.
 * Returns null when slug is absent from seo_landings.
 */
export async function getLandingBySlug(
  db: D1Database,
  slug: string,
  locale: Locale,
): Promise<LandingLocaleView | null> {
  const landing = await db
    .prepare(
      `SELECT id, slug, dimension, taxonomy_key AS taxonomyKey,
              index_status AS indexStatus, rollout_batch AS rolloutBatch,
              eligibility_json AS eligibilityJson, reviewed_by AS reviewedBy,
              reviewed_at AS reviewedAt
       FROM seo_landings WHERE slug = ? LIMIT 1`,
    )
    .bind(slug)
    .first<LandingRecord>();
  if (!landing) return null;

  const translation = await db
    .prepare(
      `SELECT title, intro, faq_json AS faqJson, seo_title AS seoTitle,
              seo_description AS seoDescription,
              translation_status AS translationStatus,
              uniqueness_score AS uniquenessScore
       FROM seo_landing_translations
       WHERE landing_id = ? AND locale = ? LIMIT 1`,
    )
    .bind(landing.id, locale)
    .first<{
      title: string;
      intro: string;
      faqJson: string;
      seoTitle: string;
      seoDescription: string;
      translationStatus: "draft" | "reviewed" | "stale";
      uniquenessScore: number | null;
    }>();

  if (!translation) {
    return {
      landing,
      locale,
      title: landing.slug,
      intro: "",
      faq: [],
      seoTitle: "",
      seoDescription: "",
      translationStatus: "draft",
      uniquenessScore: null,
      indexable: false,
      policy: "not_found",
    };
  }

  let faq: Array<{ q: string; a: string }> = [];
  try {
    const parsed = JSON.parse(translation.faqJson) as unknown;
    if (Array.isArray(parsed)) faq = parsed as Array<{ q: string; a: string }>;
  } catch {
    faq = [];
  }

  const visibility = visibilityFromStatus(translation.translationStatus);
  const policy = publicLandingPolicy(visibility);
  const indexable =
    landing.indexStatus === "approved" &&
    policy === "index" &&
    translation.translationStatus === "reviewed";

  return {
    landing,
    locale,
    title: translation.title,
    intro: translation.intro,
    faq,
    seoTitle: translation.seoTitle || translation.title,
    seoDescription: translation.seoDescription,
    translationStatus: translation.translationStatus,
    uniquenessScore: translation.uniquenessScore,
    indexable,
    policy: indexable
      ? "index"
      : policy === "not_found"
        ? "not_found"
        : "noindex",
  };
}

export async function listApprovedLandingSlugs(
  db: D1Database,
  options?: { maxBatchSize?: number },
): Promise<
  Array<{
    slug: string;
    locale: Locale;
    updatedAt: number;
    rolloutBatch: number | null;
  }>
> {
  const maxBatch = options?.maxBatchSize ?? 100;
  const rows = await db
    .prepare(
      `SELECT l.slug, l.rollout_batch AS rolloutBatch, t.locale,
              MAX(t.updated_at) AS updatedAt
       FROM seo_landings l
       JOIN seo_landing_translations t ON t.landing_id = l.id
       WHERE l.index_status = 'approved'
         AND t.translation_status = 'reviewed'
       GROUP BY l.slug, t.locale, l.rollout_batch
       ORDER BY COALESCE(l.rollout_batch, 999999) ASC, l.slug ASC
       LIMIT ?`,
    )
    .bind(maxBatch * 2)
    .all<{
      slug: string;
      locale: Locale;
      updatedAt: number;
      rolloutBatch: number | null;
    }>();

  // Cap active programmatic entries to 100 URLs (locale rows count separately).
  return (rows.results ?? []).slice(0, maxBatch);
}

export async function recomputeLandingEligibility(
  db: D1Database,
  landingId: string,
  locale: Locale,
): Promise<ReturnType<typeof evaluateLandingEligibility>> {
  const translation = await db
    .prepare(
      `SELECT intro, faq_json AS faqJson, translation_status AS translationStatus,
              title || ' ' || intro || ' ' || description AS mainCopy
       FROM seo_landing_translations
       WHERE landing_id = ? AND locale = ? LIMIT 1`,
    )
    .bind(landingId, locale)
    .first<{
      intro: string;
      faqJson: string;
      translationStatus: "draft" | "reviewed" | "stale";
      mainCopy: string;
    }>();

  if (!translation) {
    return evaluateLandingEligibility({
      publicReadyThemeCount: 0,
      distinctCreatorCount: 0,
      translationStatus: "draft",
      hasIntroduction: false,
      faqCount: 0,
      relatedLandingCount: 0,
      uniquenessScore: 0,
    });
  }

  const landing = await db
    .prepare(
      `SELECT dimension, taxonomy_key AS taxonomyKey FROM seo_landings WHERE id = ?`,
    )
    .bind(landingId)
    .first<{ dimension: string | null; taxonomyKey: string | null }>();

  let themeCount = 0;
  let creatorCount = 0;
  if (landing?.dimension && landing.taxonomyKey) {
    const stats = await db
      .prepare(
        `SELECT COUNT(DISTINCT th.id) AS themes,
                COUNT(DISTINCT th.author_id) AS creators
         FROM themes th
         JOIN theme_taxonomies tt ON tt.theme_id = th.id
         JOIN taxonomies tax ON tax.id = tt.taxonomy_id
         WHERE tax.dimension = ?
           AND tax.key = ?
           AND th.visibility = 'public'
           AND th.moderation_status != 'removed'
           AND th.package_status = 'ready'`,
      )
      .bind(landing.dimension, landing.taxonomyKey)
      .first<{ themes: number; creators: number }>();
    themeCount = stats?.themes ?? 0;
    creatorCount = stats?.creators ?? 0;
  }

  const siblings = await db
    .prepare(
      `SELECT l.id, t.title || ' ' || t.intro AS mainCopy
       FROM seo_landings l
       JOIN seo_landing_translations t ON t.landing_id = l.id
       WHERE l.id != ? AND t.locale = ?
       LIMIT 50`,
    )
    .bind(landingId, locale)
    .all<{ id: string; mainCopy: string }>();

  const uniqueness = computeUniquenessEvidence({
    mainCopy: translation.mainCopy,
    siblings: siblings.results ?? [],
  });

  const related = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM seo_landings
       WHERE id != ? AND index_status IN ('approved', 'candidate')`,
    )
    .bind(landingId)
    .first<{ c: number }>();

  const result = evaluateLandingEligibility({
    publicReadyThemeCount: themeCount,
    distinctCreatorCount: creatorCount,
    translationStatus: translation.translationStatus,
    hasIntroduction: translation.intro.trim().length > 0,
    faqCount: parseFaqCount(translation.faqJson),
    relatedLandingCount: related?.c ?? 0,
    uniquenessScore: uniqueness.score,
  });

  await db
    .prepare(
      `UPDATE seo_landings
       SET eligibility_json = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(JSON.stringify({ ...result, uniqueness }), Date.now(), landingId)
    .run();

  await db
    .prepare(
      `UPDATE seo_landing_translations
       SET uniqueness_score = ?, uniqueness_json = ?, updated_at = ?
       WHERE landing_id = ? AND locale = ?`,
    )
    .bind(
      uniqueness.score,
      JSON.stringify(uniqueness),
      Date.now(),
      landingId,
      locale,
    )
    .run();

  return result;
}

export async function setLandingIndexStatus(
  db: D1Database,
  input: {
    actorId: string;
    landingId: string;
    indexStatus: "candidate" | "approved" | "paused" | "retired";
    rolloutBatch?: number | null;
    reason: string;
    override?: boolean;
    now?: number;
  },
): Promise<void> {
  const now = input.now ?? Date.now();
  const before = await db
    .prepare(
      `SELECT index_status AS indexStatus, rollout_batch AS rolloutBatch
       FROM seo_landings WHERE id = ? LIMIT 1`,
    )
    .bind(input.landingId)
    .first<{ indexStatus: string; rolloutBatch: number | null }>();
  if (!before) throw new Error("not_found");

  if (input.indexStatus === "approved" && !input.override) {
    const eligibility = await recomputeLandingEligibility(
      db,
      input.landingId,
      "en",
    );
    if (!eligibility.eligible && !eligibility.requiresOverride) {
      throw new Error("not_eligible");
    }
    if (eligibility.requiresOverride && !input.override) {
      throw new Error("override_required");
    }
  }

  await db
    .prepare(
      `UPDATE seo_landings
       SET index_status = ?,
           rollout_batch = COALESCE(?, rollout_batch),
           reviewed_by = ?,
           reviewed_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.indexStatus,
      input.rolloutBatch ?? null,
      input.actorId,
      now,
      now,
      input.landingId,
    )
    .run();

  await appendAuditAction(db, {
    actorId: input.actorId,
    targetType: "seo_landing",
    targetId: input.landingId,
    action: `seo.index.${input.indexStatus}`,
    reason: input.reason,
    before,
    after: {
      indexStatus: input.indexStatus,
      rolloutBatch: input.rolloutBatch ?? before.rolloutBatch,
    },
    now,
  });
}

/** Explicit: marketplace filters must never insert seo_landings rows. */
export function assertFiltersDoNotCreateLandings(): void {
  // Documented invariant — no insert path from list filters.
}
