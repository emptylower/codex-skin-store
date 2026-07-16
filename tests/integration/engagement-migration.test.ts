import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const REQUIRED_TABLES = [
  "auth_intents",
  "favorites",
  "comments",
  "reports",
  "moderation_actions",
  "engagement_events",
  "rate_limit_windows",
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

describe("engagement community migration", () => {
  it("creates community engagement tables", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).all<{ name: string }>();

    expect(tables.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([...REQUIRED_TABLES]),
    );
  });

  it("rejects duplicate favorites (user_id, theme_id)", async () => {
    await insertUser("user-fav-dup", "fav-dup-author");
    await insertTheme("theme-fav-dup", "user-fav-dup", "fav-dup");

    await expect(
      env.DB.batch([
        env.DB.prepare(
          "INSERT INTO favorites(user_id,theme_id,created_at) VALUES(?,?,?)",
        ).bind("user-fav-dup", "theme-fav-dup", 1),
        env.DB.prepare(
          "INSERT INTO favorites(user_id,theme_id,created_at) VALUES(?,?,?)",
        ).bind("user-fav-dup", "theme-fav-dup", 2),
      ]),
    ).rejects.toThrow();
  });

  it("rejects duplicate auth_intents token_hash", async () => {
    await env.DB.prepare(
      `INSERT INTO auth_intents (
         id, token_hash, action, theme_id, payload_json, expires_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "intent-a",
        "hash-dup",
        "download",
        "theme-x",
        "{}",
        NOW + 60_000,
        NOW,
      )
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO auth_intents (
           id, token_hash, action, theme_id, payload_json, expires_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          "intent-b",
          "hash-dup",
          "favorite",
          "theme-y",
          "{}",
          NOW + 60_000,
          NOW,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("exposes themes.trend_score column", async () => {
    const cols = await env.DB.prepare("PRAGMA table_info(themes)").all<{
      name: string;
    }>();
    expect(cols.results.map((c) => c.name)).toContain("trend_score");
  });
});
