import { canDownload } from "~/domain/themes/state";
import { recordEngagementEvent } from "~/services/engagement/events.server";

export class FavoriteError extends Error {
  readonly code:
    | "not_found"
    | "not_favoritable"
    | "unauthorized"
    | "conflict";

  constructor(code: FavoriteError["code"], message?: string) {
    super(message ?? code);
    this.name = "FavoriteError";
    this.code = code;
  }
}

export type FavoriteThemeRow = {
  id: string;
  slug: string;
  visibility: string;
  moderation_status: string;
  package_status: string;
  favorites_count: number;
  current_version: number | null;
};

async function loadTheme(
  db: D1Database,
  themeId: string,
): Promise<FavoriteThemeRow | null> {
  return db
    .prepare(
      `SELECT id, slug, visibility, moderation_status, package_status,
              favorites_count, current_version
       FROM themes WHERE id = ? LIMIT 1`,
    )
    .bind(themeId)
    .first<FavoriteThemeRow>();
}

function isFavoritable(theme: FavoriteThemeRow): boolean {
  // New favorites only for public non-removed themes (package may still be processing).
  return (
    theme.visibility === "public" && theme.moderation_status !== "removed"
  );
}

/** Idempotent add: INSERT OR IGNORE + bounded counter bump when inserted. */
export async function addFavorite(
  db: D1Database,
  input: { userId: string; themeId: string; now?: number },
): Promise<{ favorited: boolean; created: boolean }> {
  const theme = await loadTheme(db, input.themeId);
  if (!theme) throw new FavoriteError("not_found");
  if (!isFavoritable(theme)) throw new FavoriteError("not_favoritable");

  const now = input.now ?? Date.now();
  const insert = await db
    .prepare(
      `INSERT INTO favorites (user_id, theme_id, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, theme_id) DO NOTHING`,
    )
    .bind(input.userId, input.themeId, now)
    .run();

  const created = (insert.meta?.changes ?? 0) === 1;
  if (created) {
    await db
      .prepare(
        `UPDATE themes
         SET favorites_count = favorites_count + 1, updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, input.themeId)
      .run();

    await recordEngagementEvent(db, {
      userId: input.userId,
      themeId: input.themeId,
      themeVersion: theme.current_version ?? 0,
      eventType: "favorite_add",
      now,
    });
  }

  return { favorited: true, created };
}

/** Idempotent remove: delete if present; never let favorites_count go below 0. */
export async function removeFavorite(
  db: D1Database,
  input: { userId: string; themeId: string; now?: number },
): Promise<{ favorited: boolean; removed: boolean }> {
  const now = input.now ?? Date.now();
  const theme = await loadTheme(db, input.themeId);

  const del = await db
    .prepare(
      `DELETE FROM favorites WHERE user_id = ? AND theme_id = ?`,
    )
    .bind(input.userId, input.themeId)
    .run();

  const removed = (del.meta?.changes ?? 0) === 1;
  if (removed) {
    await db
      .prepare(
        `UPDATE themes
         SET favorites_count = CASE
           WHEN favorites_count > 0 THEN favorites_count - 1
           ELSE 0
         END,
         updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, input.themeId)
      .run();

    await recordEngagementEvent(db, {
      userId: input.userId,
      themeId: input.themeId,
      themeVersion: theme?.current_version ?? 0,
      eventType: "favorite_remove",
      now,
    });
  }

  return { favorited: false, removed };
}

export async function isFavorited(
  db: D1Database,
  userId: string,
  themeId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM favorites WHERE user_id = ? AND theme_id = ? LIMIT 1`,
    )
    .bind(userId, themeId)
    .first<{ ok: number }>();
  return Boolean(row);
}

export async function countFavoritesBatch(
  db: D1Database,
  themeIds: readonly string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (themeIds.length === 0) return map;

  // Bound batch size for D1 variable limits.
  const chunk = themeIds.slice(0, 50);
  const placeholders = chunk.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT id, favorites_count FROM themes WHERE id IN (${placeholders})`,
    )
    .bind(...chunk)
    .all<{ id: string; favorites_count: number }>();

  for (const row of rows.results) {
    map.set(row.id, Math.max(0, row.favorites_count));
  }
  return map;
}

export type FavoriteLibraryItem = {
  themeId: string;
  slug: string;
  favoritedAt: number;
  visibility: string;
  moderationStatus: string;
  packageStatus: string;
  name: string | null;
  summary: string | null;
};

/**
 * Personal library: relation retained for removed themes, but UI excludes them.
 * Ordered by most recently saved.
 */
export async function listFavoriteLibrary(
  db: D1Database,
  input: { userId: string; locale: string; includeRemoved?: boolean },
): Promise<FavoriteLibraryItem[]> {
  const rows = await db
    .prepare(
      `SELECT f.theme_id AS theme_id, f.created_at AS favorited_at,
              t.slug AS slug, t.visibility AS visibility,
              t.moderation_status AS moderation_status,
              t.package_status AS package_status,
              tr.name AS name, tr.summary AS summary
       FROM favorites f
       INNER JOIN themes t ON t.id = f.theme_id
       LEFT JOIN theme_translations tr
         ON tr.theme_id = t.id AND tr.locale = ?
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC
       LIMIT 200`,
    )
    .bind(input.locale, input.userId)
    .all<{
      theme_id: string;
      favorited_at: number;
      slug: string;
      visibility: string;
      moderation_status: string;
      package_status: string;
      name: string | null;
      summary: string | null;
    }>();

  return rows.results
    .filter((row) => {
      if (input.includeRemoved) return true;
      // Exclude removed from library UI; retain relation in DB.
      return row.moderation_status !== "removed";
    })
    .map((row) => ({
      themeId: row.theme_id,
      slug: row.slug,
      favoritedAt: row.favorited_at,
      visibility: row.visibility,
      moderationStatus: row.moderation_status,
      packageStatus: row.package_status,
      name: row.name,
      summary: row.summary,
    }));
}

/** Re-export canDownload for callers that need package readiness alongside favorites. */
export { canDownload };
