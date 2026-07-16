import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  computeReleaseMetrics,
  metricsToCsv,
  weekPeriodUtc,
} from "~/services/analytics/metrics.server";

const NOW = 1_740_000_000_000;

describe("release metrics", () => {
  it("computes deterministic aggregates without user PII", async () => {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, handle, display_name, role, upload_status, created_at, updated_at)
       VALUES ('m-user-1', 'muser1', 'U1', 'user', 'active', ?, ?),
              ('m-user-2', 'muser2', 'U2', 'user', 'active', ?, ?),
              ('m-admin', 'madmin', 'A', 'admin', 'active', ?, ?)`,
    )
      .bind(NOW, NOW, NOW, NOW, NOW, NOW)
      .run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO themes (
         id, author_id, slug, source_locale, current_version,
         visibility, moderation_status, package_status,
         favorites_count, downloads_count, created_at, updated_at
       ) VALUES
         ('m-theme-1', 'm-user-1', 'm-theme-1', 'en', 1, 'public', 'clean', 'ready', 0, 0, ?, ?),
         ('m-theme-2', 'm-admin', 'm-theme-2', 'en', 1, 'public', 'clean', 'ready', 0, 0, ?, ?)`,
    )
      .bind(NOW, NOW, NOW, NOW)
      .run();

    for (let i = 0; i < 6; i += 1) {
      await env.DB.prepare(
        `INSERT INTO engagement_events (
           id, user_id, theme_id, theme_version, event_type, platform, created_at
         ) VALUES (?, ?, 'm-theme-1', 1, 'download', 'macos', ?)`,
      )
        .bind(`ev-d-${i}`, `m-user-${(i % 2) + 1}`, NOW - i * 1000)
        .run();
    }

    await env.DB.prepare(
      `INSERT INTO engagement_events (
         id, user_id, theme_id, theme_version, event_type, platform, created_at
       ) VALUES ('ev-p-1', 'm-user-1', 'm-theme-1', 1, 'prompt_copy', 'macos', ?)`,
    )
      .bind(NOW)
      .run();

    const metrics = await computeReleaseMetrics(env.DB, {
      startMs: NOW - 7 * 24 * 60 * 60 * 1000,
      endMs: NOW + 1000,
    });

    expect(metrics.deliveries.downloadCount).toBe(6);
    expect(metrics.deliveries.promptCopyCount).toBe(1);
    expect(metrics.deliveries.distinctThemes).toBe(1);
    // Fewer than 5 distinct users → suppressed
    expect(metrics.deliveries.distinctUsers).toBeNull();
    expect(metrics.suppressed).toContain("deliveries.distinctUsers");
    expect(metrics.catalog.publicReadyThemes).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(metrics)).not.toContain("m-user-1");
    expect(JSON.stringify(metrics)).not.toMatch(/token|ip_hash|comment body/i);

    const csv = metricsToCsv(metrics);
    expect(csv).toContain("deliveries.downloadCount,6");
    expect(weekPeriodUtc(NOW).endMs).toBe(NOW);
  });
});
