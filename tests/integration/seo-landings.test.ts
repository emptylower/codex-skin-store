import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  getLandingBySlug,
  listApprovedLandingSlugs,
  setLandingIndexStatus,
} from "~/services/seo/landings.server";

const NOW = 1_739_000_000_000;

async function seedLanding() {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, handle, display_name, role, upload_status, created_at, updated_at)
     VALUES ('seo-admin', 'seoadm', 'SEO Admin', 'admin', 'active', ?, ?)`,
  )
    .bind(NOW, NOW)
    .run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO seo_landings (
       id, slug, eligibility_status, index_status, eligibility_json,
       created_at, updated_at
     ) VALUES ('land-1', 'soft-dark', 'eligible', 'candidate', '{}', ?, ?)`,
  )
    .bind(NOW, NOW)
    .run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO seo_landing_translations (
       id, landing_id, locale, title, description, body_markdown,
       translation_status, intro, faq_json, seo_title, seo_description,
       uniqueness_score, uniqueness_json, created_at, updated_at
     ) VALUES (
       'slt-en-1', 'land-1', 'en', 'Soft Dark', 'desc', '',
       'reviewed', 'Curated soft dark Codex skins.',
       '[{"q":"What?","a":"Soft dark"},{"q":"Who?","a":"Creators"}]',
       'Soft Dark Themes', 'Browse soft dark themes',
       0.55, '{}', ?, ?
     )`,
  )
    .bind(NOW, NOW)
    .run();
}

describe("seo landings registry", () => {
  it("returns registry landings only and 404-policy for unapproved public", async () => {
    await seedLanding();
    const view = await getLandingBySlug(env.DB, "soft-dark", "en");
    expect(view).not.toBeNull();
    expect(view?.landing.indexStatus).toBe("candidate");
    expect(view?.indexable).toBe(false);

    const missing = await getLandingBySlug(env.DB, "never-created-by-filter", "en");
    expect(missing).toBeNull();
  });

  it("lists only approved reviewed landings for sitemap", async () => {
    await seedLanding();
    await setLandingIndexStatus(env.DB, {
      actorId: "seo-admin",
      landingId: "land-1",
      indexStatus: "approved",
      rolloutBatch: 1,
      reason: "eligible batch 1",
      override: true,
      now: NOW + 1,
    });

    const approved = await listApprovedLandingSlugs(env.DB);
    expect(approved.some((row) => row.slug === "soft-dark" && row.locale === "en")).toBe(
      true,
    );
  });
});
