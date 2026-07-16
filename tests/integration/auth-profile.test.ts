import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "~/services/identity.server";
import { updateProfile } from "~/services/profiles.server";

const NOW = 1_700_300_000_000;

async function insertUser(id: string, handle: string) {
  await env.DB.prepare(
    `INSERT INTO users (
       id, handle, display_name, bio, role, upload_status,
       email_verified, deletion_status, created_at, updated_at
     ) VALUES (?, ?, ?, '', 'user', 'active', 0, 'active', ?, ?)`,
  )
    .bind(id, handle, handle, NOW, NOW)
    .run();
}

describe("auth profile", () => {
  beforeAll(async () => {
    await insertUser("user-1", "user-one");
    await insertUser("user-2", "user-two");
  });

  it("links verified matching OAuth identities to one profile", async () => {
    const auth = createAuth(env, "https://store.test");
    expect(auth.options.account?.accountLinking).toMatchObject({
      enabled: true,
      allowDifferentEmails: false,
      requireLocalEmailVerified: true,
    });
    expect(
      auth.options.account?.accountLinking?.trustedProviders,
    ).toBeUndefined();

    await updateProfile(env.DB, "user-1", {
      handle: " Neon_Rider ",
      displayName: "Neon Rider",
      bio: "Theme maker",
    });

    const row = await env.DB.prepare(
      `SELECT handle, display_name, bio FROM users WHERE id = ?`,
    )
      .bind("user-1")
      .first<{ handle: string; display_name: string; bio: string }>();

    expect(row).toMatchObject({
      handle: "neon-rider",
      display_name: "Neon Rider",
      bio: "Theme maker",
    });

    await expect(
      updateProfile(env.DB, "user-2", {
        handle: "neon rider",
        displayName: "Other",
        bio: "",
      }),
    ).rejects.toMatchObject({ code: "handle_taken" });
  });

  it("creates Better Auth tables and creator pipeline columns", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).all<{ name: string }>();
    const names = tables.results.map((row) => row.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "accounts",
        "sessions",
        "verifications",
        "source_uploads",
        "package_jobs",
      ]),
    );

    const columns = await env.DB.prepare(
      "PRAGMA table_info(theme_versions)",
    ).all<{ name: string }>();
    const columnNames = columns.results.map((row) => row.name);
    expect(columnNames).toEqual(
      expect.arrayContaining([
        "generation_state",
        "source_key",
        "preview_key",
        "manifest_key",
      ]),
    );
  });
});
