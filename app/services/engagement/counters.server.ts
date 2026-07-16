import {
  ageDaysFromCreated,
  computeTrendScore,
} from "~/domain/engagement/trend";
import {
  countRecentFavorites,
  countRecentUniqueDeliveries,
} from "~/services/engagement/events.server";

const PAGE_SIZE = 50;

/**
 * Idempotent counter reconciliation from accepted events/relations.
 * Recalculates downloads_count, favorites_count, and trend_score in pages.
 */
export async function reconcileCounters(
  env: { DB: D1Database },
  scheduledTime: number | Date,
): Promise<{ themesProcessed: number }> {
  const now =
    typeof scheduledTime === "number" ? scheduledTime : scheduledTime.getTime();

  let offset = 0;
  let themesProcessed = 0;

  for (;;) {
    const page = await env.DB.prepare(
      `SELECT id, created_at, current_version
       FROM themes
       ORDER BY id
       LIMIT ? OFFSET ?`,
    )
      .bind(PAGE_SIZE, offset)
      .all<{
        id: string;
        created_at: number;
        current_version: number | null;
      }>();

    if (page.results.length === 0) break;

    for (const theme of page.results) {
      const downloads = await env.DB.prepare(
        `SELECT COUNT(*) AS c
         FROM engagement_events
         WHERE theme_id = ? AND event_type = 'download'`,
      )
        .bind(theme.id)
        .first<{ c: number }>();

      const favorites = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM favorites WHERE theme_id = ?`,
      )
        .bind(theme.id)
        .first<{ c: number }>();

      const recentDeliveries = await countRecentUniqueDeliveries(
        env.DB,
        theme.id,
        now,
      );
      const recentFavorites = await countRecentFavorites(env.DB, theme.id, now);
      const ageDays = ageDaysFromCreated(theme.created_at, now);
      const trendScore = computeTrendScore({
        recentUniqueDeliveries: recentDeliveries,
        recentFavorites,
        ageDays,
      });

      await env.DB.prepare(
        `UPDATE themes
         SET downloads_count = ?,
             favorites_count = ?,
             trend_score = ?,
             updated_at = ?
         WHERE id = ?`,
      )
        .bind(downloads?.c ?? 0, favorites?.c ?? 0, trendScore, now, theme.id)
        .run();

      themesProcessed += 1;
    }

    if (page.results.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    // Safety bound for a single cron tick.
    if (offset >= 500) break;
  }

  return { themesProcessed };
}
