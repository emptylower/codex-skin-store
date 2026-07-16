import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  changeUserRole,
  removeComment,
  removeTheme,
  resolveReport,
  restoreComment,
  restoreTheme,
  restoreUploads,
  suspendUploads,
  AdminError,
} from "~/services/moderation/admin.server";
import {
  assertAuditImmutable,
  listAuditActions,
} from "~/services/moderation/audit.server";

const NOW = 1_736_000_000_000;

async function insertUser(
  id: string,
  handle: string,
  role: "user" | "moderator" | "admin" = "user",
) {
  await env.DB.prepare(
    `INSERT INTO users (id, handle, display_name, role, upload_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  )
    .bind(id, handle, handle, role, NOW, NOW)
    .run();
}

async function insertTheme(
  id: string,
  authorId: string,
  slug: string,
  visibility = "public",
  moderationStatus = "clean",
) {
  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES (?, ?, ?, 'en', 1, ?, ?, 'ready', 0, 0, ?, ?)`,
  )
    .bind(id, authorId, slug, visibility, moderationStatus, NOW, NOW)
    .run();
}

describe("admin moderation actions", () => {
  it("lets moderators dismiss reports and remove/restore themes", async () => {
    await insertUser("mod-1", "mod1", "moderator");
    await insertUser("author-1", "author1");
    await insertTheme(
      "theme-mod",
      "author-1",
      "theme-mod",
      "unlisted",
      "flagged",
    );

    await env.DB.prepare(
      `INSERT INTO reports (
         id, reporter_id, target_type, target_id, reason, details,
         status, created_at
       ) VALUES ('rep-1', 'author-1', 'theme', 'theme-mod', 'spam', NULL, 'open', ?)`,
    )
      .bind(NOW)
      .run();

    const dismissed = await resolveReport(env.DB, {
      actorId: "mod-1",
      reportId: "rep-1",
      outcome: "dismissed",
      reason: "not spam after review",
      now: NOW,
    });
    expect(dismissed.action).toBe("report.dismiss");

    await removeTheme(env.DB, {
      actorId: "mod-1",
      themeId: "theme-mod",
      reason: "copyright concern",
      now: NOW + 1,
    });

    const removed = await env.DB.prepare(
      `SELECT visibility, moderation_status FROM themes WHERE id = ?`,
    )
      .bind("theme-mod")
      .first<{ visibility: string; moderation_status: string }>();
    expect(removed?.visibility).toBe("hidden");
    expect(removed?.moderation_status).toBe("removed");

    await restoreTheme(env.DB, {
      actorId: "mod-1",
      themeId: "theme-mod",
      reason: "false positive",
      now: NOW + 2,
    });

    const restored = await env.DB.prepare(
      `SELECT visibility, moderation_status FROM themes WHERE id = ?`,
    )
      .bind("theme-mod")
      .first<{ visibility: string; moderation_status: string }>();
    // Restores prior unlisted/flagged, not blindly public/clean.
    expect(restored?.visibility).toBe("unlisted");
    expect(restored?.moderation_status).toBe("flagged");
  });

  it("lets moderators remove/restore comments", async () => {
    await insertUser("mod-2", "mod2", "moderator");
    await insertUser("author-2", "author2");
    await insertTheme("theme-c", "author-2", "theme-c");
    await env.DB.prepare(
      `INSERT INTO comments (
         id, theme_id, user_id, author_label, body, status, created_at
       ) VALUES ('c-1', 'theme-c', 'author-2', 'author2', 'hi', 'visible', ?)`,
    )
      .bind(NOW)
      .run();

    await removeComment(env.DB, {
      actorId: "mod-2",
      commentId: "c-1",
      reason: "harassment",
      now: NOW,
    });
    let comment = await env.DB.prepare(
      `SELECT status FROM comments WHERE id = ?`,
    )
      .bind("c-1")
      .first<{ status: string }>();
    expect(comment?.status).toBe("removed_by_admin");

    await restoreComment(env.DB, {
      actorId: "mod-2",
      commentId: "c-1",
      reason: "appealed",
      now: NOW + 1,
    });
    comment = await env.DB.prepare(`SELECT status FROM comments WHERE id = ?`)
      .bind("c-1")
      .first<{ status: string }>();
    expect(comment?.status).toBe("visible");
  });

  it("restricts upload suspension and role changes to admins", async () => {
    await insertUser("mod-3", "mod3", "moderator");
    await insertUser("admin-1", "admin1", "admin");
    await insertUser("target-1", "target1");

    await expect(
      suspendUploads(env.DB, {
        actorId: "mod-3",
        userId: "target-1",
        reason: "abuse",
        now: NOW,
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
    } satisfies Partial<AdminError>);

    await suspendUploads(env.DB, {
      actorId: "admin-1",
      userId: "target-1",
      reason: "malware upload pattern",
      now: NOW,
    });
    let user = await env.DB.prepare(
      `SELECT upload_status FROM users WHERE id = ?`,
    )
      .bind("target-1")
      .first<{ upload_status: string }>();
    expect(user?.upload_status).toBe("suspended");

    await restoreUploads(env.DB, {
      actorId: "admin-1",
      userId: "target-1",
      reason: "cleared",
      now: NOW + 1,
    });
    user = await env.DB.prepare(`SELECT upload_status FROM users WHERE id = ?`)
      .bind("target-1")
      .first<{ upload_status: string }>();
    expect(user?.upload_status).toBe("active");

    await changeUserRole(env.DB, {
      actorId: "admin-1",
      userId: "target-1",
      role: "moderator",
      reason: "promote trusted reviewer",
      now: NOW + 2,
    });
    const role = await env.DB.prepare(`SELECT role FROM users WHERE id = ?`)
      .bind("target-1")
      .first<{ role: string }>();
    expect(role?.role).toBe("moderator");
  });

  it("exposes audit list/read only and forbids mutation helpers", async () => {
    await insertUser("admin-2", "admin2", "admin");
    await insertUser("author-3", "author3");
    await insertTheme("theme-a", "author-3", "theme-a");
    await removeTheme(env.DB, {
      actorId: "admin-2",
      themeId: "theme-a",
      reason: "policy violation",
      now: NOW,
    });

    const actions = await listAuditActions(env.DB, {
      targetType: "theme",
      targetId: "theme-a",
    });
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]?.action).toBe("theme.remove");

    expect(() => assertAuditImmutable()).toThrow("audit_immutable");
  });
});
