import { describe, expect, it } from "vitest";

import {
  isIndexableCreator,
  isIndexableMarketplace,
  isIndexableTaxonomy,
  isIndexableTheme,
  type ThemeSeoRecord,
} from "~/services/seo/index-policy";

const baseTheme: ThemeSeoRecord = {
  visibility: "public",
  moderationStatus: "clean",
  packageStatus: "ready",
  translationStatus: {
    en: "reviewed",
    "zh-hans": "reviewed",
  },
};

describe("isIndexableTheme", () => {
  it("indexes public ready themes with reviewed locale translation", () => {
    expect(isIndexableTheme(baseTheme, "en")).toBe(true);
    expect(isIndexableTheme(baseTheme, "zh-hans")).toBe(true);
  });

  it("rejects non-public, removed, non-ready, or unreviewed locale variants", () => {
    expect(
      isIndexableTheme({ ...baseTheme, visibility: "unlisted" }, "en"),
    ).toBe(false);
    expect(
      isIndexableTheme({ ...baseTheme, moderationStatus: "removed" }, "en"),
    ).toBe(false);
    expect(
      isIndexableTheme({ ...baseTheme, packageStatus: "processing" }, "en"),
    ).toBe(false);
    expect(
      isIndexableTheme(
        {
          ...baseTheme,
          translationStatus: { en: "reviewed", "zh-hans": "draft" },
        },
        "zh-hans",
      ),
    ).toBe(false);
    expect(
      isIndexableTheme(
        {
          ...baseTheme,
          translationStatus: { en: "reviewed" },
        },
        "zh-hans",
      ),
    ).toBe(false);
  });

  it("allows flagged themes that remain public and ready", () => {
    expect(
      isIndexableTheme({ ...baseTheme, moderationStatus: "flagged" }, "en"),
    ).toBe(true);
  });
});

describe("isIndexableMarketplace", () => {
  it("indexes clean locale marketplace roots only", () => {
    expect(isIndexableMarketplace({})).toBe(true);
    expect(isIndexableMarketplace({ sort: "trending" })).toBe(true);
  });

  it("noindexes any query or filter combination", () => {
    expect(isIndexableMarketplace({ q: "neon" })).toBe(false);
    expect(isIndexableMarketplace({ platform: "macos" })).toBe(false);
    expect(isIndexableMarketplace({ mode: "dark" })).toBe(false);
    expect(isIndexableMarketplace({ media: "static" })).toBe(false);
    expect(isIndexableMarketplace({ taxonomy: ["neon"] })).toBe(false);
    expect(isIndexableMarketplace({ sort: "newest" })).toBe(false);
    expect(isIndexableMarketplace({ sort: "downloads" })).toBe(false);
  });
});

describe("isIndexableCreator", () => {
  it("indexes creators with at least one public ready theme", () => {
    expect(isIndexableCreator({ publicThemeCount: 1 })).toBe(true);
    expect(isIndexableCreator({ publicThemeCount: 0 })).toBe(false);
  });
});

describe("isIndexableTaxonomy", () => {
  it("indexes controlled taxonomy hubs that exist and have public inventory", () => {
    expect(
      isIndexableTaxonomy({
        exists: true,
        dimension: "style",
        key: "neon",
        publicThemeCount: 1,
      }),
    ).toBe(true);
    expect(
      isIndexableTaxonomy({
        exists: false,
        dimension: "style",
        key: "missing",
        publicThemeCount: 1,
      }),
    ).toBe(false);
    expect(
      isIndexableTaxonomy({
        exists: true,
        dimension: "style",
        key: "empty",
        publicThemeCount: 0,
      }),
    ).toBe(false);
  });
});
