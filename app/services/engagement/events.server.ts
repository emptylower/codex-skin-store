import type { EngagementEventType } from "~/db/schema/engagement";

export type RecordEventInput = {
  userId?: string | null;
  themeId: string;
  themeVersion: number;
  eventType: EngagementEventType;
  platform?: string | null;
  now?: number;
  id?: string;
};

/**
 * Append-only engagement event. Failures should be logged by callers via
 * waitUntil and must never block package bytes or clipboard success.
 */
export async function recordEngagementEvent(
  db: D1Database,
  input: RecordEventInput,
): Promise<void> {
  const id = input.id ?? crypto.randomUUID();
  const now = input.now ?? Date.now();
  await db
    .prepare(
      `INSERT INTO engagement_events (
         id, user_id, theme_id, theme_version, event_type, platform, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.userId ?? null,
      input.themeId,
      input.themeVersion,
      input.eventType,
      input.platform ?? null,
      now,
    )
    .run();
}

export type DeliveryWindowStats = {
  themeId: string;
  recentUniqueDeliveries: number;
  recentFavorites: number;
};

/**
 * North-star delivery query: distinct user/theme pairs with download or
 * prompt_copy in the last 7 days. One pair counts once even if both event types.
 */
export async function countRecentUniqueDeliveries(
  db: D1Database,
  themeId: string,
  now: number,
  windowMs = 7 * 24 * 60 * 60 * 1000,
): Promise<number> {
  const since = now - windowMs;
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM (
         SELECT user_id
         FROM engagement_events
         WHERE theme_id = ?
           AND event_type IN ('download', 'prompt_copy')
           AND created_at >= ?
           AND user_id IS NOT NULL
         GROUP BY user_id
       )`,
    )
    .bind(themeId, since)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function countRecentFavorites(
  db: D1Database,
  themeId: string,
  now: number,
  windowMs = 7 * 24 * 60 * 60 * 1000,
): Promise<number> {
  const since = now - windowMs;
  // Net adds in window (adds minus removes) bounded at 0, or count current relations created recently.
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM favorites
       WHERE theme_id = ? AND created_at >= ?`,
    )
    .bind(themeId, since)
    .first<{ c: number }>();
  return row?.c ?? 0;
}
