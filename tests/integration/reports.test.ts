import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createD1AbuseGate,
  hashIp,
} from "~/platform/cloudflare/rate-limit.server";
import {
  createReport,
  ReportError,
} from "~/services/moderation/reports.server";

const NOW = 1_734_000_000_000;

describe("reports and abuse gate", () => {
  it("creates open reports without auto-hiding themes and dedupes 24h", async () => {
    const themeId = "rep-theme";
    const author = "rep-author";
    const reporter = "rep-user";
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, handle, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
    )
      .bind(author, author, author, NOW, NOW, reporter, reporter, reporter, NOW, NOW)
      .run();
    await env.DB.prepare(
      `INSERT INTO themes (
         id, author_id, slug, source_locale, current_version,
         visibility, moderation_status, package_status,
         favorites_count, downloads_count, created_at, updated_at
       ) VALUES (?, ?, 'rep-theme', 'en', 1, 'public', 'clean', 'ready', 0, 0, ?, ?)`,
    )
      .bind(themeId, author, NOW, NOW)
      .run();

    const created = await createReport(env.DB, {
      reporterId: reporter,
      targetType: "theme",
      targetId: themeId,
      reason: "spam",
      details: "looks spammy",
      now: NOW,
    });
    expect(created.status).toBe("open");

    const theme = await env.DB.prepare(
      `SELECT visibility, moderation_status FROM themes WHERE id = ?`,
    )
      .bind(themeId)
      .first<{ visibility: string; moderation_status: string }>();
    expect(theme?.visibility).toBe("public");
    expect(theme?.moderation_status).toBe("clean");

    await expect(
      createReport(env.DB, {
        reporterId: reporter,
        targetType: "theme",
        targetId: themeId,
        reason: "spam",
        now: NOW + 1000,
      }),
    ).rejects.toMatchObject({ code: "duplicate" } satisfies Partial<ReportError>);
  });

  it("rate-limits using hashed IP windows", async () => {
    const gate = createD1AbuseGate(env.DB, { now: () => NOW });
    const ipHash = await hashIp("203.0.113.10", "test-secret");
    let last = { allowed: true, challengeRequired: false };
    for (let i = 0; i < 11; i += 1) {
      last = await gate.check({
        action: "report",
        userId: "rate-user",
        ipHash,
      });
    }
    expect(last.allowed).toBe(false);
  });
});
