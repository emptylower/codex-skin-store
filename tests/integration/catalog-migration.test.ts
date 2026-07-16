import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const REQUIRED_TABLES = [
  "users",
  "themes",
  "theme_versions",
  "theme_translations",
  "taxonomies",
  "taxonomy_translations",
  "theme_taxonomies",
  "seo_landings",
  "seo_landing_translations",
] as const;

const NOW = 1_700_000_000_000;

async function insertUser(id: string, handle: string) {
  await env.DB.prepare(
    `INSERT INTO users (id, handle, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, handle, handle, NOW, NOW)
    .run();
}

async function insertTheme(id: string, authorId: string, slug: string) {
  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      authorId,
      slug,
      "en",
      1,
      "public",
      "clean",
      "ready",
      0,
      0,
      NOW,
      NOW,
    )
    .run();
}

describe("catalog migration", () => {
  it("creates catalog and SEO tables", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).all<{ name: string }>();

    expect(tables.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([...REQUIRED_TABLES]),
    );
  });

  it("rejects duplicate theme slugs", async () => {
    await insertUser("user-dup-theme", "dup-theme-author");
    await insertTheme("theme-dup-a", "user-dup-theme", "shared-slug");

    await expect(
      insertTheme("theme-dup-b", "user-dup-theme", "shared-slug"),
    ).rejects.toThrow();
  });

  it("rejects duplicate taxonomy dimension keys", async () => {
    await env.DB.prepare(
      `INSERT INTO taxonomies (id, dimension, key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("tax-dup-a", "style", "neon", NOW, NOW)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO taxonomies (id, dimension, key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind("tax-dup-b", "style", "neon", NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it("rejects themes.author_id pointing to a missing user", async () => {
    await expect(
      insertTheme(
        "theme-missing-author",
        "user-does-not-exist",
        "missing-author",
      ),
    ).rejects.toThrow();
  });

  it("rejects invalid theme visibility", async () => {
    await insertUser("user-vis-check", "vis-check-author");

    await expect(
      env.DB.prepare(
        `INSERT INTO themes (
           id, author_id, slug, source_locale, current_version,
           visibility, moderation_status, package_status,
           favorites_count, downloads_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          "theme-bad-vis",
          "user-vis-check",
          "bad-visibility",
          "en",
          1,
          "published",
          "clean",
          "ready",
          0,
          0,
          NOW,
          NOW,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("rejects duplicate theme_versions (theme_id, version)", async () => {
    await insertUser("user-ver-dup", "ver-dup-author");
    await insertTheme("theme-ver-dup", "user-ver-dup", "ver-dup");

    await env.DB.prepare(
      `INSERT INTO theme_versions (
         id, theme_id, version, manifest_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("tv-dup-a", "theme-ver-dup", 1, "{}", NOW, NOW)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO theme_versions (
           id, theme_id, version, manifest_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind("tv-dup-b", "theme-ver-dup", 1, "{}", NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it("rejects duplicate theme_translations (theme_id, locale)", async () => {
    await insertUser("user-tr-dup", "tr-dup-author");
    await insertTheme("theme-tr-dup", "user-tr-dup", "tr-dup");

    await env.DB.prepare(
      `INSERT INTO theme_translations (
         id, theme_id, locale, name, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("tt-dup-a", "theme-tr-dup", "en", "Dup A", NOW, NOW)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO theme_translations (
           id, theme_id, locale, name, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind("tt-dup-b", "theme-tr-dup", "en", "Dup B", NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it("rejects duplicate theme_taxonomies (theme_id, taxonomy_id)", async () => {
    await insertUser("user-tt-dup", "tt-dup-author");
    await insertTheme("theme-tt-dup", "user-tt-dup", "tt-dup");

    await env.DB.prepare(
      `INSERT INTO taxonomies (id, dimension, key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("tax-tt-dup", "mood", "focus", NOW, NOW)
      .run();

    await env.DB.prepare(
      `INSERT INTO theme_taxonomies (theme_id, taxonomy_id) VALUES (?, ?)`,
    )
      .bind("theme-tt-dup", "tax-tt-dup")
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO theme_taxonomies (theme_id, taxonomy_id) VALUES (?, ?)`,
      )
        .bind("theme-tt-dup", "tax-tt-dup")
        .run(),
    ).rejects.toThrow();
  });

  it("rejects invalid taxonomy dimension", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO taxonomies (id, dimension, key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind("tax-bad-dim", "color", "blue", NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it("rejects seo_landings with only one of dimension/taxonomy_key set", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO seo_landings (
           id, slug, dimension, taxonomy_key, eligibility_status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind("seo-half-a", "half-a", "style", null, "candidate", NOW, NOW)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO seo_landings (
           id, slug, dimension, taxonomy_key, eligibility_status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind("seo-half-b", "half-b", null, "neon", "candidate", NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });
});
