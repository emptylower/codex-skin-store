import { describe, expect, it } from "vitest";

import { evaluateLandingEligibility } from "~/domain/seo/eligibility";
import { computeUniquenessEvidence } from "~/domain/seo/uniqueness";

const eligibleBase = {
  publicReadyThemeCount: 6,
  distinctCreatorCount: 3,
  translationStatus: "reviewed" as const,
  hasIntroduction: true,
  faqCount: 2,
  relatedLandingCount: 2,
  uniquenessScore: 0.4,
};

describe("landing eligibility", () => {
  it("passes the full gate at thresholds", () => {
    const result = evaluateLandingEligibility(eligibleBase);
    expect(result.eligible).toBe(true);
    expect(result.hardFail).toBe(false);
  });

  it("hard-fails under-threshold inventory and draft locale", () => {
    expect(
      evaluateLandingEligibility({
        ...eligibleBase,
        publicReadyThemeCount: 5,
      }).hardFail,
    ).toBe(true);
    expect(
      evaluateLandingEligibility({
        ...eligibleBase,
        distinctCreatorCount: 2,
      }).hardFail,
    ).toBe(true);
    expect(
      evaluateLandingEligibility({
        ...eligibleBase,
        translationStatus: "draft",
      }).hardFail,
    ).toBe(true);
    expect(
      evaluateLandingEligibility({
        ...eligibleBase,
        faqCount: 1,
      }).hardFail,
    ).toBe(true);
  });

  it("requires override for uniqueness 0.30..<0.40 and hard-fails below 0.30", () => {
    const mid = evaluateLandingEligibility({
      ...eligibleBase,
      uniquenessScore: 0.35,
    });
    expect(mid.eligible).toBe(false);
    expect(mid.requiresOverride).toBe(true);
    expect(mid.hardFail).toBe(false);

    const low = evaluateLandingEligibility({
      ...eligibleBase,
      uniquenessScore: 0.29,
    });
    expect(low.hardFail).toBe(true);
  });

  it("computes uniqueness evidence from sibling copy", () => {
    const evidence = computeUniquenessEvidence({
      mainCopy: "soft dark themes for calm coding sessions with muted blues",
      siblings: [
        {
          id: "sib-1",
          mainCopy:
            "soft dark themes for calm coding sessions with muted blues",
        },
        {
          id: "sib-2",
          mainCopy: "bright neon arcade skins for high energy creators",
        },
      ],
    });
    expect(evidence.algorithmVersion).toBe(1);
    expect(evidence.comparedLandingIds).toEqual(["sib-1", "sib-2"]);
    expect(evidence.score).toBeLessThan(0.5);
  });
});
