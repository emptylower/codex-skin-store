import { createElement } from "react";
import { env } from "cloudflare:workers";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import SeoLanding, { loader, meta } from "~/routes/seo-landing";
import * as identity from "~/services/identity.server";

const NOW = 1_739_100_000_000;

function cloudflareContext() {
  return {
    cloudflare: {
      env: { ...env, APP_ORIGIN: "https://store.test" },
      ctx: {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("seo-landing route", () => {
  it("404s for unknown slug and unapproved public landings", async () => {
    vi.spyOn(identity, "getOptionalUser").mockResolvedValue(null);

    await expect(
      loader({
        request: new Request("https://store.test/en/l/missing"),
        params: { locale: "en", slug: "missing" },
        context: cloudflareContext(),
      } as never),
    ).rejects.toMatchObject({ status: 404 });

    await env.DB.prepare(
      `INSERT OR IGNORE INTO seo_landings (
         id, slug, eligibility_status, index_status, eligibility_json,
         created_at, updated_at
       ) VALUES ('land-route-1', 'candidate-only', 'candidate', 'candidate', '{}', ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO seo_landing_translations (
         id, landing_id, locale, title, description, body_markdown,
         translation_status, intro, faq_json, seo_title, seo_description,
         uniqueness_json, created_at, updated_at
       ) VALUES (
         'slt-route-1', 'land-route-1', 'en', 'Candidate', '', '',
         'reviewed', 'Intro', '[{"q":"a","a":"b"},{"q":"c","a":"d"}]',
         'Candidate', 'Candidate desc', '{}', ?, ?
       )`,
    )
      .bind(NOW, NOW)
      .run();

    await expect(
      loader({
        request: new Request("https://store.test/en/l/candidate-only"),
        params: { locale: "en", slug: "candidate-only" },
        context: cloudflareContext(),
      } as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("renders approved landing with ItemList structured data and no AggregateRating", async () => {
    vi.spyOn(identity, "getOptionalUser").mockResolvedValue(null);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO seo_landings (
         id, slug, eligibility_status, index_status, eligibility_json,
         created_at, updated_at
       ) VALUES ('land-route-2', 'approved-soft', 'eligible', 'approved', '{}', ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO seo_landing_translations (
         id, landing_id, locale, title, description, body_markdown,
         translation_status, intro, faq_json, seo_title, seo_description,
         uniqueness_json, created_at, updated_at
       ) VALUES (
         'slt-route-2', 'land-route-2', 'en', 'Approved Soft', '', '',
         'reviewed', 'A real introduction for soft themes.',
         '[{"q":"What is this?","a":"Soft themes."},{"q":"Who?","a":"Creators."}]',
         'Approved Soft Themes', 'Soft theme collection', '{}', ?, ?
       )`,
    )
      .bind(NOW, NOW)
      .run();

    const data = await loader({
      request: new Request("https://store.test/en/l/approved-soft"),
      params: { locale: "en", slug: "approved-soft" },
      context: cloudflareContext(),
    } as never);

    expect(data.indexable).toBe(true);
    const tags = meta({ data } as never);
    const ld = tags.find(
      (t) => t && typeof t === "object" && "script:ld+json" in t,
    ) as { "script:ld+json": unknown } | undefined;
    const serialized = JSON.stringify(ld?.["script:ld+json"] ?? {});
    expect(serialized).toContain("ItemList");
    expect(serialized).not.toContain("AggregateRating");

    const html = renderToStaticMarkup(
      createElement(SeoLanding, {
        loaderData: data,
        params: { locale: "en", slug: "approved-soft" },
      } as never),
    );
    expect(html).toContain("Approved Soft");
    expect(html).toContain("A real introduction");
  });
});
