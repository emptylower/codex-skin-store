import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { reconcileCounters } from "~/services/engagement/counters.server";
import {
  countRecentUniqueDeliveries,
  recordEngagementEvent,
} from "~/services/engagement/events.server";

const NOW = 1_732_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

async function seedTheme(id: string) {
  const userId = `author-${id}`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, handle, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(userId, userId, userId, NOW - 2 * DAY, NOW - 2 * DAY)
    .run();
  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, trend_score, created_at, updated_at
     ) VALUES (?, ?, ?, 'en', 1, 'public', 'clean', 'ready', 0, 0, 0, ?, ?)`,
  )
    .bind(id, userId, id, NOW - 2 * DAY, NOW - 2 * DAY)
    .run();
}

describe("event counters and trend reconcile", () => {
  it("counts distinct user deliveries once per window even with download+prompt_copy", async () => {
    const themeId = "trend-theme-1";
    await seedTheme(themeId);

    await recordEngagementEvent(env.DB, {
      userId: "u1",
      themeId,
      themeVersion: 1,
      eventType: "download",
      now: NOW - DAY,
    });
    await recordEngagementEvent(env.DB, {
      userId: "u1",
      themeId,
      themeVersion: 1,
      eventType: "prompt_copy",
      now: NOW - DAY + 1000,
    });
    await recordEngagementEvent(env.DB, {
      userId: "u2",
      themeId,
      themeVersion: 1,
      eventType: "download",
      now: NOW - DAY,
    });

    const unique = await countRecentUniqueDeliveries(env.DB, themeId, NOW);
    expect(unique).toBe(2);

    await env.DB.prepare(
      `INSERT INTO favorites (user_id, theme_id, created_at) VALUES (?, ?, ?), (?, ?, ?)`,
    )
      .bind("u1", themeId, NOW - 1000, "u3", themeId, NOW - 2000)
      .run();

    const result = await reconcileCounters(env, NOW);
    expect(result.themesProcessed).toBeGreaterThan(0);

    const row = await env.DB.prepare(
      `SELECT downloads_count, favorites_count, trend_score FROM themes WHERE id = ?`,
    )
      .bind(themeId)
      .first<{
        downloads_count: number;
        favorites_count: number;
        trend_score: number;
      }>();

    expect(row?.downloads_count).toBe(2);
    expect(row?.favorites_count).toBe(2);
    // 2 deliveries *5 + 2 favorites *2 + max(0,14-2) = 10+4+12 = 26
    expect(row?.trend_score).toBe(26);
  });
});
