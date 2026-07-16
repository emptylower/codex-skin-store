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
    const now = 1_700_000_000_000;

    await env.DB.prepare(
      `INSERT INTO users (id, handle, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("user-dup-theme", "dup-theme-author", "Dup Theme Author", now, now)
      .run();

    await env.DB.prepare(
      `INSERT INTO themes (
         id, author_id, slug, source_locale, current_version,
         visibility, moderation_status, package_status,
         favorites_count, downloads_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "theme-dup-a",
        "user-dup-theme",
        "shared-slug",
        "en",
        1,
        "public",
        "clean",
        "ready",
        0,
        0,
        now,
        now,
      )
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO themes (
           id, author_id, slug, source_locale, current_version,
           visibility, moderation_status, package_status,
           favorites_count, downloads_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          "theme-dup-b",
          "user-dup-theme",
          "shared-slug",
          "en",
          1,
          "public",
          "clean",
          "ready",
          0,
          0,
          now,
          now,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("rejects duplicate taxonomy dimension keys", async () => {
    const now = 1_700_000_000_000;

    await env.DB.prepare(
      `INSERT INTO taxonomies (id, dimension, key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("tax-dup-a", "style", "neon", now, now)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO taxonomies (id, dimension, key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind("tax-dup-b", "style", "neon", now, now)
        .run(),
    ).rejects.toThrow();
  });
});
