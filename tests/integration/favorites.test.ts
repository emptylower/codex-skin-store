import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  addFavorite,
  FavoriteError,
  listFavoriteLibrary,
  removeFavorite,
} from "~/services/engagement/favorites.server";

const NOW = 1_731_000_000_000;

async function seedTheme(opts: {
  id: string;
  userId: string;
  slug: string;
  visibility?: string;
  moderation?: string;
}) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, handle, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(opts.userId, opts.userId, opts.userId, NOW, NOW)
    .run();
  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES (?, ?, ?, 'en', 1, ?, ?, 'ready', 0, 0, ?, ?)`,
  )
    .bind(
      opts.id,
      opts.userId,
      opts.slug,
      opts.visibility ?? "public",
      opts.moderation ?? "clean",
      NOW,
      NOW,
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO theme_translations (id, theme_id, locale, name, summary, translation_status, created_at, updated_at)
     VALUES (?, ?, 'en', ?, ?, 'reviewed', ?, ?)`,
  )
    .bind(`tr-${opts.id}`, opts.id, opts.slug, "summary", NOW, NOW)
    .run();
}

describe("favorites service", () => {
  it("adds and removes idempotently and bounds count at zero", async () => {
    const author = "fav-author-1";
    const user = "fav-user-1";
    const themeId = "fav-theme-1";
    await seedTheme({ id: themeId, userId: author, slug: "fav-theme-1" });
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, handle, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(user, user, user, NOW, NOW)
      .run();

    const a1 = await addFavorite(env.DB, {
      userId: user,
      themeId,
      now: NOW,
    });
    expect(a1.created).toBe(true);
    const a2 = await addFavorite(env.DB, {
      userId: user,
      themeId,
      now: NOW + 1,
    });
    expect(a2.created).toBe(false);

    const count1 = await env.DB.prepare(
      `SELECT favorites_count FROM themes WHERE id = ?`,
    )
      .bind(themeId)
      .first<{ favorites_count: number }>();
    expect(count1?.favorites_count).toBe(1);

    const r1 = await removeFavorite(env.DB, {
      userId: user,
      themeId,
      now: NOW + 2,
    });
    expect(r1.removed).toBe(true);
    const r2 = await removeFavorite(env.DB, {
      userId: user,
      themeId,
      now: NOW + 3,
    });
    expect(r2.removed).toBe(false);

    const count2 = await env.DB.prepare(
      `SELECT favorites_count FROM themes WHERE id = ?`,
    )
      .bind(themeId)
      .first<{ favorites_count: number }>();
    expect(count2?.favorites_count).toBe(0);
  });

  it("rejects new favorites on removed themes and hides them from library UI", async () => {
    const author = "fav-author-2";
    const user = "fav-user-2";
    const themeId = "fav-theme-2";
    await seedTheme({
      id: themeId,
      userId: author,
      slug: "fav-theme-2",
      moderation: "removed",
    });
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, handle, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(user, user, user, NOW, NOW)
      .run();

    await expect(
      addFavorite(env.DB, { userId: user, themeId, now: NOW }),
    ).rejects.toMatchObject({
      code: "not_favoritable",
    } satisfies Partial<FavoriteError>);

    // Retain relation if previously saved, exclude from library listing.
    await env.DB.prepare(
      `INSERT INTO favorites (user_id, theme_id, created_at) VALUES (?, ?, ?)`,
    )
      .bind(user, themeId, NOW)
      .run();

    const library = await listFavoriteLibrary(env.DB, {
      userId: user,
      locale: "en",
    });
    expect(library.find((i) => i.themeId === themeId)).toBeUndefined();

    const libraryAll = await listFavoriteLibrary(env.DB, {
      userId: user,
      locale: "en",
      includeRemoved: true,
    });
    expect(libraryAll.find((i) => i.themeId === themeId)).toBeTruthy();
  });
});
