import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  DELETE_CONFIRMATION_PHRASE,
  deleteAccount,
  DeleteAccountError,
} from "~/services/identity/delete-account.server";

const NOW = 1_735_000_000_000;

describe("account deletion", () => {
  it("removes identity links/favorites, anonymizes comments/events, unlists themes", async () => {
    const userId = "del-user";
    const themeId = "del-theme";
    await env.DB.prepare(
      `INSERT INTO users (id, handle, display_name, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(userId, "del-user", "Delete Me", "del@example.com", NOW, NOW)
      .run();
    await env.DB.prepare(
      `INSERT INTO accounts (id, account_id, provider_id, user_id, created_at, updated_at)
       VALUES ('acc-1', 'oauth-1', 'github', ?, ?, ?)`,
    )
      .bind(userId, NOW, NOW)
      .run();
    await env.DB.prepare(
      `INSERT INTO sessions (id, expires_at, token, created_at, updated_at, user_id)
       VALUES ('sess-1', ?, 'tok-1', ?, ?, ?)`,
    )
      .bind(NOW + 100000, NOW, NOW, userId)
      .run();
    await env.DB.prepare(
      `INSERT INTO themes (
         id, author_id, slug, source_locale, current_version,
         visibility, moderation_status, package_status,
         favorites_count, downloads_count, created_at, updated_at
       ) VALUES (?, ?, 'del-theme', 'en', 1, 'public', 'clean', 'ready', 0, 0, ?, ?)`,
    )
      .bind(themeId, userId, NOW, NOW)
      .run();
    await env.DB.prepare(
      `INSERT INTO favorites (user_id, theme_id, created_at) VALUES (?, ?, ?)`,
    )
      .bind(userId, themeId, NOW)
      .run();
    await env.DB.prepare(
      `INSERT INTO comments (id, theme_id, user_id, author_label, body, status, created_at)
       VALUES ('c-del', ?, ?, 'Delete Me', 'keep body', 'visible', ?)`,
    )
      .bind(themeId, userId, NOW)
      .run();
    await env.DB.prepare(
      `INSERT INTO engagement_events (id, user_id, theme_id, theme_version, event_type, created_at)
       VALUES ('e-del', ?, ?, 1, 'download', ?)`,
    )
      .bind(userId, themeId, NOW)
      .run();

    const result = await deleteAccount(env.DB, {
      userId,
      confirmation: DELETE_CONFIRMATION_PHRASE,
      now: NOW + 1,
    });
    expect(result.status).toBe("deleted");

    expect(
      await env.DB.prepare(`SELECT id FROM accounts WHERE user_id = ?`)
        .bind(userId)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare(`SELECT id FROM sessions WHERE user_id = ?`)
        .bind(userId)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare(`SELECT 1 AS ok FROM favorites WHERE user_id = ?`)
        .bind(userId)
        .first(),
    ).toBeNull();

    const comment = await env.DB.prepare(
      `SELECT user_id, author_label, body FROM comments WHERE id = 'c-del'`,
    ).first<{
      user_id: string | null;
      author_label: string;
      body: string | null;
    }>();
    expect(comment?.user_id).toBeNull();
    expect(comment?.author_label).toBe("Deleted user");
    expect(comment?.body).toBe("keep body");

    const event = await env.DB.prepare(
      `SELECT user_id FROM engagement_events WHERE id = 'e-del'`,
    ).first<{ user_id: string | null }>();
    expect(event?.user_id).toBeNull();

    const theme = await env.DB.prepare(
      `SELECT visibility FROM themes WHERE id = ?`,
    )
      .bind(themeId)
      .first<{ visibility: string }>();
    expect(theme?.visibility).toBe("unlisted");

    const user = await env.DB.prepare(
      `SELECT email, deletion_status, display_name FROM users WHERE id = ?`,
    )
      .bind(userId)
      .first<{
        email: string | null;
        deletion_status: string;
        display_name: string;
      }>();
    expect(user?.email).toBeNull();
    expect(user?.deletion_status).toBe("deleted");
    expect(user?.display_name).toBe("Deleted user");
  });

  it("requires exact confirmation phrase", async () => {
    await expect(
      deleteAccount(env.DB, {
        userId: "x",
        confirmation: "delete my account",
      }),
    ).rejects.toMatchObject({
      code: "confirmation_mismatch",
    } satisfies Partial<DeleteAccountError>);
  });
});
