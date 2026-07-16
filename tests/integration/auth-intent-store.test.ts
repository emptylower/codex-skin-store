import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createIntent,
  consumeIntent,
  hashIntentToken,
  IntentError,
} from "~/services/identity/intents.server";

const NOW = 1_720_000_000_000;

describe("auth intent store", () => {
  it("stores only token hash and consumes once", async () => {
    const created = await createIntent(env.DB, {
      action: "download",
      themeId: "theme-intent-1",
      payload: { returnPath: "/en/themes/neon-road" },
      now: NOW,
    });

    expect(created.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(created.expiresAt).toBe(NOW + 10 * 60 * 1000);

    const hash = await hashIntentToken(created.token);
    const stored = await env.DB.prepare(
      `SELECT token_hash, action, theme_id, consumed_at FROM auth_intents WHERE id = ?`,
    )
      .bind(created.id)
      .first<{
        token_hash: string;
        action: string;
        theme_id: string;
        consumed_at: number | null;
      }>();

    expect(stored?.token_hash).toBe(hash);
    expect(stored?.token_hash).not.toBe(created.token);
    expect(stored?.action).toBe("download");
    expect(stored?.theme_id).toBe("theme-intent-1");
    expect(stored?.consumed_at).toBeNull();

    const consumed = await consumeIntent(env.DB, created.token, {
      now: NOW + 1_000,
      themeId: "theme-intent-1",
    });
    expect(consumed.action).toBe("download");
    expect(consumed.payload.returnPath).toBe("/en/themes/neon-road");

    await expect(
      consumeIntent(env.DB, created.token, { now: NOW + 2_000 }),
    ).rejects.toMatchObject({ code: "already_consumed" } satisfies Partial<IntentError>);
  });

  it("rejects expired and tampered tokens", async () => {
    const created = await createIntent(env.DB, {
      action: "favorite",
      themeId: "theme-intent-2",
      now: NOW,
    });

    await expect(
      consumeIntent(env.DB, created.token, {
        now: NOW + 11 * 60 * 1000,
      }),
    ).rejects.toMatchObject({ code: "expired" });

    await expect(
      consumeIntent(env.DB, `${created.token}x`, { now: NOW + 1_000 }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects theme mismatch after consume attempt when wrong theme requested", async () => {
    const created = await createIntent(env.DB, {
      action: "comment",
      themeId: "theme-a",
      payload: { body: "hello" },
      now: NOW,
    });

    await expect(
      consumeIntent(env.DB, created.token, {
        now: NOW + 500,
        themeId: "theme-b",
      }),
    ).rejects.toMatchObject({ code: "theme_mismatch" });
  });
});
