import { describe, expect, it } from "vitest";

import {
  assertNoAggregateRating,
  buildBreadcrumbList,
  buildComment,
  buildCreativeWork,
  buildItemList,
  buildPerson,
} from "~/services/seo/structured-data";
import {
  createSeoService,
  landingPath,
  MAX_SITEMAP_LANDING_URLS,
  renderSitemapXml,
} from "~/services/seo/sitemap.server";
import type {
  LandingSitemapCandidate,
  SeoRepository,
} from "~/platform/ports";

describe("release SEO structured data", () => {
  it("builds CreativeWork, Person, Comment, BreadcrumbList, ItemList without AggregateRating", () => {
    const creative = buildCreativeWork({
      name: "Neon",
      description: "A neon theme",
      url: "https://store.test/en/themes/neon",
      creatorName: "Ada",
      creatorUrl: "https://store.test/en/creators/ada",
      dateModified: 1_700_000_000_000,
    });
    const person = buildPerson({
      name: "Ada",
      url: "https://store.test/en/creators/ada",
    });
    const comment = buildComment({
      text: "Great theme",
      authorName: "Bob",
      dateCreated: 1_700_000_000_000,
    });
    const crumbs = buildBreadcrumbList("https://store.test", [
      { name: "Home", path: "/en" },
      { name: "Neon", path: "/en/themes/neon" },
    ]);
    const list = buildItemList({
      name: "Soft Dark",
      url: "https://store.test/en/l/soft-dark",
      items: [
        { name: "A", url: "https://store.test/en/themes/a" },
        { name: "B", url: "https://store.test/en/themes/b" },
      ],
    });

    expect(creative["@type"]).toBe("CreativeWork");
    expect((creative.author as { "@type": string })["@type"]).toBe("Person");
    expect(person["@type"]).toBe("Person");
    expect(comment["@type"]).toBe("Comment");
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(list["@type"]).toBe("ItemList");

    assertNoAggregateRating([creative, person, comment, crumbs, list]);
  });

  it("includes only approved landings and uses content lastmod not request time", async () => {
    const landings: LandingSitemapCandidate[] = [
      {
        slug: "approved-one",
        locale: "en",
        updatedAt: 1_700_000_000_000,
        rolloutBatch: 1,
      },
      {
        slug: "approved-two",
        locale: "en",
        updatedAt: 1_700_100_000_000,
        rolloutBatch: 2,
      },
    ];

    const repo: SeoRepository = {
      async listThemeSitemapCandidates() {
        return [];
      },
      async listCreatorSitemapCandidates() {
        return [];
      },
      async listTaxonomySitemapCandidates() {
        return [];
      },
      async listLandingSitemapCandidates() {
        return landings;
      },
    };

    const xml = await createSeoService(repo).buildSitemapXml(
      "https://store.test",
    );
    expect(xml).toContain("https://store.test/en/l/approved-one");
    expect(xml).toContain("2023-11-14"); // lastmod from updatedAt, not now
    expect(xml).not.toContain("AggregateRating");
    expect(landingPath("en", "approved-one")).toBe("/en/l/approved-one");
    expect(MAX_SITEMAP_LANDING_URLS).toBe(100);
  });

  it("renderSitemapXml escapes and omits null lastmod", () => {
    const xml = renderSitemapXml([
      { loc: "https://store.test/en?x=1&y=2", lastmod: null },
    ]);
    expect(xml).toContain("&amp;");
    expect(xml).not.toContain("<lastmod>");
  });
});
