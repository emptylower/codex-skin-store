import { describe, expect, it } from "vitest";

import {
  buildLandingHreflang,
  isReviewComplete,
  publicLandingPolicy,
  visibilityFromStatus,
} from "~/services/seo/translations.server";

describe("translation parity service", () => {
  it("requires complete fields for review", () => {
    expect(
      isReviewComplete({
        title: "Soft Dark Themes",
        intro: "A curated introduction.",
        seoTitle: "Soft Dark Codex Themes",
        seoDescription: "Browse soft dark themes.",
        faqJson: JSON.stringify([
          { q: "What?", a: "Soft dark skins." },
          { q: "Who?", a: "Creators." },
        ]),
      }),
    ).toBe(true);

    expect(
      isReviewComplete({
        title: "Soft Dark Themes",
        intro: "",
        seoTitle: "x",
        seoDescription: "y",
        faqJson: "[]",
      }),
    ).toBe(false);
  });

  it("builds hreflang only for reviewed locales", () => {
    const links = buildLandingHreflang({
      origin: "https://store.test",
      slug: "soft-dark",
      statuses: {
        en: "reviewed",
        "zh-hans": "draft",
      },
    });
    expect(links.some((l) => l.hreflang === "en")).toBe(true);
    expect(links.some((l) => l.hreflang === "zh-Hans")).toBe(false);
    expect(publicLandingPolicy(visibilityFromStatus("draft"))).toBe("noindex");
  });
});
