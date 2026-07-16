import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createCopyrightClaim,
  resolveCopyrightClaim,
  TakedownError,
} from "~/services/moderation/takedown.server";

const NOW = 1_738_000_000_000;

async function seed() {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, handle, display_name, role, upload_status, created_at, updated_at)
     VALUES ('author-td', 'authortd', 'Author', 'user', 'active', ?, ?),
            ('admin-td', 'admintd', 'Admin', 'admin', 'active', ?, ?)`,
  )
    .bind(NOW, NOW, NOW, NOW)
    .run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES ('theme-td', 'author-td', 'theme-td', 'en', 1,
               'public', 'clean', 'ready', 0, 0, ?, ?)`,
  )
    .bind(NOW, NOW)
    .run();
}

describe("copyright takedown intake", () => {
  it("creates claim + evidence without deleting theme or exposing auto-delete", async () => {
    await seed();
    const stored: string[] = [];
    const claim = await createCopyrightClaim(env.DB, {
      claimantEmail: "owner@example.com",
      claimantName: "Owner Example",
      targetThemeId: "theme-td",
      rightsBasis: "original photographer",
      statement:
        "I am the copyright owner and submit this claim in good faith under penalty of perjury.",
      signature: "Owner Example",
      evidence: [
        {
          id: "ev-td-1",
          mediaType: "image/png",
          byteSize: 128,
          sha256: "abc",
        },
      ],
      storeEvidence: async ({ objectKey }) => {
        stored.push(objectKey);
      },
      now: NOW,
    });

    expect(claim.status).toBe("open");
    expect(claim.evidenceKeys[0]).toBe("evidence/" + claim.id + "/ev-td-1");
    expect(stored[0]).toMatch(/^evidence\//);

    const theme = await env.DB.prepare(
      `SELECT visibility, moderation_status FROM themes WHERE id = 'theme-td'`,
    ).first<{ visibility: string; moderation_status: string }>();
    expect(theme?.visibility).toBe("public");
    expect(theme?.moderation_status).toBe("clean");

    await expect(
      createCopyrightClaim(env.DB, {
        claimantEmail: "owner@example.com",
        claimantName: "Owner Example",
        targetThemeId: "theme-td",
        rightsBasis: "original photographer",
        statement:
          "I am the copyright owner and submit this claim in good faith under penalty of perjury.",
        signature: "Owner Example",
        now: NOW + 1000,
      }),
    ).rejects.toMatchObject({
      code: "duplicate",
    } satisfies Partial<TakedownError>);
  });

  it("accepted claim removes theme; rejected does not restore", async () => {
    await seed();
    const claim = await createCopyrightClaim(env.DB, {
      claimantEmail: "other@example.com",
      claimantName: "Other",
      targetThemeId: "theme-td",
      rightsBasis: "exclusive licensee",
      statement:
        "I am the copyright owner and submit this claim in good faith under penalty of perjury.",
      signature: "Other",
      now: NOW + 10_000,
    });

    const accepted = await resolveCopyrightClaim(env.DB, {
      actorId: "admin-td",
      claimId: claim.id,
      outcome: "accepted",
      reason: "valid ownership evidence",
      now: NOW + 10_001,
    });
    expect(accepted.themeRemoved).toBe(true);

    const theme = await env.DB.prepare(
      `SELECT visibility, moderation_status FROM themes WHERE id = 'theme-td'`,
    ).first<{ visibility: string; moderation_status: string }>();
    expect(theme?.visibility).toBe("hidden");
    expect(theme?.moderation_status).toBe("removed");
  });
});
