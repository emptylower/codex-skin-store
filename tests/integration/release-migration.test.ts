import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const NOW = 1_735_000_000_000;

const REQUIRED_TABLES = [
  "copyright_claims",
  "copyright_evidence",
  "moderation_actions",
  "seo_landings",
  "seo_landing_translations",
] as const;

const REQUIRED_INDEXES = [
  "copyright_claims_status_idx",
  "copyright_evidence_claim_idx",
  "seo_landings_index_status_idx",
  "seo_landing_translations_status_idx",
  "engagement_events_type_time_idx",
  "themes_public_ready_idx",
] as const;

describe("release gate migration", () => {
  it("creates copyright and SEO review tables", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).all<{ name: string }>();

    expect(tables.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([...REQUIRED_TABLES]),
    );
  });

  it("exposes SEO landing review columns", async () => {
    const landingCols = await env.DB.prepare(
      "PRAGMA table_info(seo_landings)",
    ).all<{ name: string }>();
    const landingNames = landingCols.results.map((c) => c.name);
    expect(landingNames).toEqual(
      expect.arrayContaining([
        "index_status",
        "rollout_batch",
        "eligibility_json",
        "reviewed_by",
        "reviewed_at",
      ]),
    );

    const translationCols = await env.DB.prepare(
      "PRAGMA table_info(seo_landing_translations)",
    ).all<{ name: string }>();
    const translationNames = translationCols.results.map((c) => c.name);
    expect(translationNames).toEqual(
      expect.arrayContaining([
        "translation_status",
        "intro",
        "faq_json",
        "seo_title",
        "seo_description",
        "uniqueness_score",
        "uniqueness_json",
        "reviewed_by",
        "reviewed_at",
      ]),
    );
  });

  it("accepts copyright claim + evidence rows", async () => {
    await env.DB.prepare(
      `INSERT INTO copyright_claims (
         id, claimant_email, claimant_name, target_theme_id,
         rights_basis, statement, signature, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
      .bind(
        "claim-1",
        "owner@example.com",
        "Owner",
        "theme-1",
        "original_author",
        "I own this work under penalty of perjury.",
        "Owner Name",
        NOW,
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO copyright_evidence (
         id, claim_id, object_key, sha256, media_type, byte_size, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "ev-1",
        "claim-1",
        "evidence/claim-1/ev-1",
        "abc123",
        "image/png",
        1024,
        NOW,
      )
      .run();

    const claim = await env.DB.prepare(
      `SELECT status FROM copyright_claims WHERE id = ?`,
    )
      .bind("claim-1")
      .first<{ status: string }>();
    expect(claim?.status).toBe("open");
  });

  it("accepts stale translation status and uniqueness fields", async () => {
    await env.DB.prepare(
      `INSERT INTO seo_landings (
         id, slug, eligibility_status, index_status, eligibility_json,
         created_at, updated_at
       ) VALUES (?, ?, 'candidate', 'candidate', '{}', ?, ?)`,
    )
      .bind("landing-1", "soft-dark", NOW, NOW)
      .run();

    await env.DB.prepare(
      `INSERT INTO seo_landing_translations (
         id, landing_id, locale, title, description, body_markdown,
         translation_status, intro, faq_json, seo_title, seo_description,
         uniqueness_score, uniqueness_json, created_at, updated_at
       ) VALUES (?, ?, 'en', 'Soft Dark', 'desc', '', 'stale',
                 'intro text', '[]', 'Soft Dark SEO', 'Soft Dark desc',
                 0.55, '{"version":1}', ?, ?)`,
    )
      .bind("slt-1", "landing-1", NOW, NOW)
      .run();

    const row = await env.DB.prepare(
      `SELECT translation_status, uniqueness_score FROM seo_landing_translations
       WHERE id = ?`,
    )
      .bind("slt-1")
      .first<{ translation_status: string; uniqueness_score: number }>();
    expect(row?.translation_status).toBe("stale");
    expect(row?.uniqueness_score).toBeCloseTo(0.55);
  });

  it("creates metric and review indexes", async () => {
    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='index'",
    ).all<{ name: string }>();
    expect(indexes.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([...REQUIRED_INDEXES]),
    );
  });

  it("records moderation_actions as append-only application policy (insert only)", async () => {
    await env.DB.prepare(
      `INSERT INTO moderation_actions (
         id, actor_id, target_type, target_id, action, reason,
         before_json, after_json, created_at
       ) VALUES (?, ?, 'report', ?, 'report.dismiss', 'spam',
                 '{}', '{}', ?)`,
    )
      .bind("ma-1", "admin-1", "rep-1", NOW)
      .run();

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM moderation_actions WHERE id = ?`,
    )
      .bind("ma-1")
      .first<{ c: number }>();
    expect(count?.c).toBe(1);
  });
});
