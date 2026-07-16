export type LandingEligibilityInput = {
  publicReadyThemeCount: number;
  distinctCreatorCount: number;
  translationStatus: "draft" | "reviewed" | "stale";
  hasIntroduction: boolean;
  faqCount: number;
  relatedLandingCount: number;
  uniquenessScore: number;
};

export type LandingEligibilityResult = {
  eligible: boolean;
  candidate: boolean;
  hardFail: boolean;
  requiresOverride: boolean;
  reasons: string[];
};

export const ELIGIBILITY_THRESHOLDS = {
  minThemes: 6,
  minCreators: 3,
  minFaq: 2,
  minRelated: 2,
  uniquenessEligible: 0.4,
  uniquenessCandidateFloor: 0.3,
} as const;

/**
 * Locale landing eligibility gates for the controlled programmatic registry.
 * Arbitrary filter combinations never create landings — only registry rows do.
 */
export function evaluateLandingEligibility(
  input: LandingEligibilityInput,
): LandingEligibilityResult {
  const reasons: string[] = [];

  if (input.publicReadyThemeCount < ELIGIBILITY_THRESHOLDS.minThemes) {
    reasons.push("insufficient_themes");
  }
  if (input.distinctCreatorCount < ELIGIBILITY_THRESHOLDS.minCreators) {
    reasons.push("insufficient_creators");
  }
  if (input.translationStatus !== "reviewed") {
    reasons.push("translation_not_reviewed");
  }
  if (!input.hasIntroduction) {
    reasons.push("missing_introduction");
  }
  if (input.faqCount < ELIGIBILITY_THRESHOLDS.minFaq) {
    reasons.push("insufficient_faq");
  }
  if (input.relatedLandingCount < ELIGIBILITY_THRESHOLDS.minRelated) {
    reasons.push("insufficient_related");
  }

  const score = input.uniquenessScore;
  if (score < ELIGIBILITY_THRESHOLDS.uniquenessCandidateFloor) {
    reasons.push("uniqueness_hard_fail");
  } else if (score < ELIGIBILITY_THRESHOLDS.uniquenessEligible) {
    reasons.push("uniqueness_requires_override");
  }

  const hardFail =
    reasons.includes("uniqueness_hard_fail") ||
    reasons.includes("insufficient_themes") ||
    reasons.includes("insufficient_creators") ||
    reasons.includes("translation_not_reviewed") ||
    reasons.includes("missing_introduction") ||
    reasons.includes("insufficient_faq") ||
    reasons.includes("insufficient_related");

  // uniqueness_requires_override is soft: still candidate, needs admin override.
  const softOnly =
    reasons.length === 1 && reasons[0] === "uniqueness_requires_override";

  const eligible = reasons.length === 0;
  const requiresOverride = reasons.includes("uniqueness_requires_override");
  const candidate = eligible || softOnly || (!hardFail && requiresOverride);

  return {
    eligible,
    candidate: eligible || candidate,
    hardFail: hardFail && !softOnly,
    requiresOverride,
    reasons,
  };
}
