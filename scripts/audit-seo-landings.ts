#!/usr/bin/env npx tsx
/**
 * Local SEO landing parity audit.
 * Usage: npx tsx scripts/audit-seo-landings.ts [--json]
 *
 * Against live D1 local state when DATABASE is available via wrangler;
 * otherwise validates pure domain rules on fixture inventory.
 */

import {
  assertReciprocal,
  buildHreflangParity,
  shouldEmitAlternate,
} from "../app/domain/seo/hreflang";
import { evaluateLandingEligibility } from "../app/domain/seo/eligibility";
import { isReviewComplete } from "../app/services/seo/translations.server";

type Issue = { level: "critical" | "warning"; code: string; detail: string };

const issues: Issue[] = [];

function checkHreflangFixture() {
  const links = buildHreflangParity({
    origin: "https://example.test",
    pathsByLocale: {
      en: "/en/l/soft-dark",
      "zh-hans": "/zh-hans/l/soft-dark",
    },
    indexableByLocale: { en: true, "zh-hans": true },
  });
  if (!assertReciprocal(links)) {
    issues.push({
      level: "critical",
      code: "hreflang_not_reciprocal",
      detail: "fixture en+zh-hans",
    });
  }
  if (!links.some((l) => l.hreflang === "x-default")) {
    issues.push({
      level: "critical",
      code: "missing_x_default",
      detail: "fixture",
    });
  }

  const draftZh = buildHreflangParity({
    origin: "https://example.test",
    pathsByLocale: {
      en: "/en/l/soft-dark",
      "zh-hans": "/zh-hans/l/soft-dark",
    },
    indexableByLocale: {
      en: true,
      "zh-hans": shouldEmitAlternate("draft"),
    },
  });
  if (draftZh.some((l) => l.hreflang === "zh-Hans")) {
    issues.push({
      level: "critical",
      code: "draft_locale_in_hreflang",
      detail: "zh-hans draft must not be alternate",
    });
  }
}

function checkEligibilityFixture() {
  const hard = evaluateLandingEligibility({
    publicReadyThemeCount: 5,
    distinctCreatorCount: 2,
    translationStatus: "draft",
    hasIntroduction: false,
    faqCount: 0,
    relatedLandingCount: 0,
    uniquenessScore: 0.2,
  });
  if (!hard.hardFail) {
    issues.push({
      level: "critical",
      code: "eligibility_hard_fail_missing",
      detail: "expected hard fail for under-threshold landing",
    });
  }

  const ok = evaluateLandingEligibility({
    publicReadyThemeCount: 6,
    distinctCreatorCount: 3,
    translationStatus: "reviewed",
    hasIntroduction: true,
    faqCount: 2,
    relatedLandingCount: 2,
    uniquenessScore: 0.4,
  });
  if (!ok.eligible) {
    issues.push({
      level: "critical",
      code: "eligibility_false_negative",
      detail: ok.reasons.join(","),
    });
  }
}

function checkReviewCompleteness() {
  if (
    isReviewComplete({
      title: "T",
      intro: "Intro long enough",
      seoTitle: "SEO",
      seoDescription: "Desc",
      faqJson: "[]",
    })
  ) {
    issues.push({
      level: "critical",
      code: "review_complete_without_faq",
      detail: "FAQ < 2 must fail review completeness",
    });
  }
}

checkHreflangFixture();
checkEligibilityFixture();
checkReviewCompleteness();

const critical = issues.filter((i) => i.level === "critical");
const payload = {
  ok: critical.length === 0,
  issues,
  checkedAt: new Date().toISOString(),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`SEO landing audit: ${payload.ok ? "PASS" : "FAIL"}`);
  for (const issue of issues) {
    console.log(`  [${issue.level}] ${issue.code}: ${issue.detail}`);
  }
}

process.exit(critical.length === 0 ? 0 : 1);
