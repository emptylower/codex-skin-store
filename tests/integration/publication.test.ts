import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MACOS_TARGET,
  WINDOWS_TARGET,
  type CreatorInput,
} from "~/domain/themes/creator-input";
import {
  createDraft,
  createVersion,
  publishTheme,
  unlistTheme,
  updateDraftMetadata,
  CreatorThemeError,
} from "~/services/creator-themes.server";

const NOW = 1_700_600_000_000;

const baseInput: CreatorInput = {
  sourceLocale: "en",
  name: "Neon Road Draft",
  description:
    "A high-contrast night drive shell for long coding sessions after dark.",
  slug: "neon-road-publish",
  license: "CC0-1.0",
  attribution: "",
  sourceUrl: "",
  platforms: ["macos", "windows"],
  appearance: "dark",
  mediaType: "static",
  accent: "#FF00AA",
  secondary: "#110022",
  highlight: "#00FFCC",
  focalPoint: { x: 0.5, y: 0.4 },
  compatibilityTargets: [MACOS_TARGET, WINDOWS_TARGET],
  rightsDeclared: true,
};

type PackageHead = {
  size: number;
  customMetadata: Record<string, string>;
};

function createMockPackages(initial?: Map<string, PackageHead>) {
  const store = initial ?? new Map<string, PackageHead>();
  return {
    store,
    head: vi.fn(async (key: string) => store.get(key) ?? null),
  };
}

async function insertUser(
  id: string,
  handle: string,
  uploadStatus: "active" | "suspended" = "active",
) {
  await env.DB.prepare(
    `INSERT INTO users (
       id, handle, display_name, bio, role, upload_status,
       email_verified, deletion_status, created_at, updated_at
     ) VALUES (?, ?, ?, '', 'user', ?, 0, 'active', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       handle = excluded.handle,
       upload_status = excluded.upload_status,
       updated_at = excluded.updated_at`,
  )
    .bind(id, handle, handle, uploadStatus, NOW, NOW)
    .run();
}

async function state(db: D1Database, themeId: string) {
  return db
    .prepare(
      `SELECT visibility, package_status, current_version, moderation_status, slug
       FROM themes WHERE id = ?`,
    )
    .bind(themeId)
    .first<{
      visibility: string;
      package_status: string;
      current_version: number | null;
      moderation_status: string;
      slug: string;
    }>();
}

async function markFixtureReady(
  db: D1Database,
  packages: ReturnType<typeof createMockPackages>,
  themeId: string,
  version: number,
  opts?: { payloadDigest?: string; archiveDigest?: string },
) {
  const packageKey = `themes/${themeId}/versions/${version}/generated/theme.zip`;
  const payloadDigest = opts?.payloadDigest ?? `payload-${themeId}-${version}`;
  const archiveDigest = opts?.archiveDigest ?? `archive-${themeId}-${version}`;

  packages.store.set(packageKey, {
    size: 2048,
    customMetadata: {
      "payload-digest": payloadDigest,
      "archive-digest": archiveDigest,
    },
  });

  await db
    .prepare(
      `UPDATE theme_versions
       SET generation_state = 'ready',
           package_key = ?,
           payload_digest = ?,
           archive_digest = ?,
           archive_bytes = 2048,
           preview_key = ?,
           manifest_key = ?,
           macos_adapter_key = ?,
           windows_adapter_key = ?,
           install_key = ?,
           prompt_key = ?,
           updated_at = ?
       WHERE theme_id = ? AND version = ?`,
    )
    .bind(
      packageKey,
      payloadDigest,
      archiveDigest,
      `themes/${themeId}/versions/${version}/generated/preview.jpg`,
      `themes/${themeId}/versions/${version}/generated/manifest.json`,
      `themes/${themeId}/versions/${version}/generated/adapters/macos/theme.json`,
      `themes/${themeId}/versions/${version}/generated/adapters/windows/theme.json`,
      `themes/${themeId}/versions/${version}/generated/INSTALL.md`,
      `themes/${themeId}/versions/${version}/generated/install-prompt.md`,
      NOW,
      themeId,
      version,
    )
    .run();
}

function makeDeps(packages = createMockPackages()) {
  return {
    db: env.DB,
    packages,
    now: () => NOW,
  };
}

describe("theme publication lifecycle", () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM package_jobs`).run();
    await env.DB.prepare(`DELETE FROM source_uploads`).run();
    await env.DB.prepare(`DELETE FROM theme_translations`).run();
    await env.DB.prepare(`DELETE FROM theme_versions`).run();
    await env.DB.prepare(`DELETE FROM themes`).run();
    await insertUser("u1", "publisher-one");
    await insertUser("u2", "publisher-two");
  });

  it("versions, publishes ready current version, and unlists without deleting history", async () => {
    const packages = createMockPackages();
    const deps = makeDeps(packages);

    const draft = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      baseInput,
    );

    await expect(
      publishTheme(deps, {
        userId: "u1",
        themeId: draft.themeId,
        version: 1,
      }),
    ).rejects.toMatchObject({ code: "version_not_ready" });

    await markFixtureReady(env.DB, packages, draft.themeId, 1);
    await publishTheme(deps, {
      userId: "u1",
      themeId: draft.themeId,
      version: 1,
    });

    expect(await state(env.DB, draft.themeId)).toMatchObject({
      visibility: "public",
      package_status: "ready",
      current_version: 1,
    });

    const changedMetadata: CreatorInput = {
      ...baseInput,
      name: "Neon Road v2",
      description:
        "Updated night drive shell with a sharper accent and clearer summary.",
      // slug intentionally same after first publish
      accent: "#FF1199",
    };

    const v2 = await createVersion(deps, {
      userId: "u1",
      themeId: draft.themeId,
      input: changedMetadata,
    });
    expect(v2.version).toBe(2);
    expect(await state(env.DB, draft.themeId)).toMatchObject({
      visibility: "public",
      current_version: 1,
    });

    const versions = await env.DB.prepare(
      `SELECT version, generation_state FROM theme_versions
       WHERE theme_id = ? ORDER BY version`,
    )
      .bind(draft.themeId)
      .all<{ version: number; generation_state: string }>();
    expect(versions.results).toEqual([
      { version: 1, generation_state: "ready" },
      { version: 2, generation_state: "awaiting_upload" },
    ]);

    await unlistTheme(deps, { userId: "u1", themeId: draft.themeId });
    expect((await state(env.DB, draft.themeId))?.visibility).toBe("unlisted");

    // History remains after unlist.
    const stillThere = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM theme_versions WHERE theme_id = ?`,
    )
      .bind(draft.themeId)
      .first<{ c: number }>();
    expect(stillThere?.c).toBe(2);
    expect((await state(env.DB, draft.themeId))?.package_status).toBe("ready");
    expect((await state(env.DB, draft.themeId))?.current_version).toBe(1);
  });

  it("rejects publish for wrong owner", async () => {
    const packages = createMockPackages();
    const deps = makeDeps(packages);
    const draft = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      { ...baseInput, slug: "owner-guard" },
    );
    await markFixtureReady(env.DB, packages, draft.themeId, 1);

    await expect(
      publishTheme(deps, {
        userId: "u2",
        themeId: draft.themeId,
        version: 1,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects not-ready and package HEAD mismatch", async () => {
    const packages = createMockPackages();
    const deps = makeDeps(packages);
    const draft = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      { ...baseInput, slug: "not-ready-theme" },
    );

    await expect(
      publishTheme(deps, {
        userId: "u1",
        themeId: draft.themeId,
        version: 1,
      }),
    ).rejects.toMatchObject({ code: "version_not_ready" });

    // Mark DB ready but leave packages empty → HEAD mismatch.
    await env.DB.prepare(
      `UPDATE theme_versions
       SET generation_state = 'ready',
           package_key = ?,
           payload_digest = 'payload-x',
           archive_digest = 'archive-x',
           updated_at = ?
       WHERE theme_id = ? AND version = 1`,
    )
      .bind(
        `themes/${draft.themeId}/versions/1/generated/theme.zip`,
        NOW,
        draft.themeId,
      )
      .run();

    await expect(
      publishTheme(deps, {
        userId: "u1",
        themeId: draft.themeId,
        version: 1,
      }),
    ).rejects.toMatchObject({ code: "package_head_mismatch" });

    // Wrong digests in HEAD also fail.
    packages.store.set(`themes/${draft.themeId}/versions/1/generated/theme.zip`, {
      size: 10,
      customMetadata: {
        "payload-digest": "wrong",
        "archive-digest": "wrong",
      },
    });
    await expect(
      publishTheme(deps, {
        userId: "u1",
        themeId: draft.themeId,
        version: 1,
      }),
    ).rejects.toMatchObject({ code: "package_head_mismatch" });
  });

  it("makes slug immutable after first publication", async () => {
    const packages = createMockPackages();
    const deps = makeDeps(packages);
    const draft = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      { ...baseInput, slug: "immutable-slug" },
    );

    // Draft can change slug.
    await updateDraftMetadata(deps, {
      userId: "u1",
      themeId: draft.themeId,
      input: { ...baseInput, slug: "immutable-slug-renamed" },
    });
    expect((await state(env.DB, draft.themeId))?.slug).toBe(
      "immutable-slug-renamed",
    );

    await markFixtureReady(env.DB, packages, draft.themeId, 1);
    await publishTheme(deps, {
      userId: "u1",
      themeId: draft.themeId,
      version: 1,
    });

    await expect(
      updateDraftMetadata(deps, {
        userId: "u1",
        themeId: draft.themeId,
        input: { ...baseInput, slug: "cannot-change" },
      }),
    ).rejects.toMatchObject({ code: "slug_immutable" });

    await expect(
      createVersion(deps, {
        userId: "u1",
        themeId: draft.themeId,
        input: { ...baseInput, slug: "cannot-change" },
      }),
    ).rejects.toMatchObject({ code: "slug_immutable" });

    // Same slug still allowed for createVersion.
    const v2 = await createVersion(deps, {
      userId: "u1",
      themeId: draft.themeId,
      input: {
        ...baseInput,
        slug: "immutable-slug-renamed",
        name: "After publish rename attempt",
        description:
          "Metadata can still change after publish as long as the slug stays put.",
      },
    });
    expect(v2.version).toBe(2);
  });

  it("rejects publishing a removed theme and cannot unlist hidden/removed", async () => {
    const packages = createMockPackages();
    const deps = makeDeps(packages);
    const draft = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      { ...baseInput, slug: "removed-theme" },
    );
    await markFixtureReady(env.DB, packages, draft.themeId, 1);

    await env.DB.prepare(
      `UPDATE themes SET moderation_status = 'removed', updated_at = ? WHERE id = ?`,
    )
      .bind(NOW, draft.themeId)
      .run();

    await expect(
      publishTheme(deps, {
        userId: "u1",
        themeId: draft.themeId,
        version: 1,
      }),
    ).rejects.toMatchObject({ code: "theme_removed" });

    await env.DB.prepare(
      `UPDATE themes
       SET moderation_status = 'clean', visibility = 'hidden', updated_at = ?
       WHERE id = ?`,
    )
      .bind(NOW, draft.themeId)
      .run();

    await expect(
      unlistTheme(deps, { userId: "u1", themeId: draft.themeId }),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("publishes v2 only after ready and leaves previous current until then", async () => {
    const packages = createMockPackages();
    const deps = makeDeps(packages);
    const draft = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      { ...baseInput, slug: "v2-switch" },
    );
    await markFixtureReady(env.DB, packages, draft.themeId, 1);
    await publishTheme(deps, {
      userId: "u1",
      themeId: draft.themeId,
      version: 1,
    });

    const v2 = await createVersion(deps, {
      userId: "u1",
      themeId: draft.themeId,
      input: {
        ...baseInput,
        slug: "v2-switch",
        name: "Neon Road Two",
        description:
          "Second version keeps the first public until the package is ready.",
      },
    });

    await expect(
      publishTheme(deps, {
        userId: "u1",
        themeId: draft.themeId,
        version: v2.version,
      }),
    ).rejects.toMatchObject({ code: "version_not_ready" });
    expect((await state(env.DB, draft.themeId))?.current_version).toBe(1);

    await markFixtureReady(env.DB, packages, draft.themeId, 2);
    await publishTheme(deps, {
      userId: "u1",
      themeId: draft.themeId,
      version: 2,
    });
    expect(await state(env.DB, draft.themeId)).toMatchObject({
      visibility: "public",
      package_status: "ready",
      current_version: 2,
    });
  });

  it("rejects slug collision on draft rename", async () => {
    const packages = createMockPackages();
    const deps = makeDeps(packages);
    await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      { ...baseInput, slug: "taken-slug" },
    );
    const draft2 = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      { ...baseInput, slug: "free-slug" },
    );

    await expect(
      updateDraftMetadata(deps, {
        userId: "u1",
        themeId: draft2.themeId,
        input: { ...baseInput, slug: "taken-slug" },
      }),
    ).rejects.toMatchObject({ code: "slug_taken" });
  });

  it("rejects unlist for non-owner", async () => {
    const packages = createMockPackages();
    const deps = makeDeps(packages);
    const draft = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      { ...baseInput, slug: "unlist-owner" },
    );
    await markFixtureReady(env.DB, packages, draft.themeId, 1);
    await publishTheme(deps, {
      userId: "u1",
      themeId: draft.themeId,
      version: 1,
    });

    await expect(
      unlistTheme(deps, { userId: "u2", themeId: draft.themeId }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

// Ensure CreatorThemeError remains constructible for route mapping.
describe("CreatorThemeError", () => {
  it("carries code", () => {
    const err = new CreatorThemeError("version_not_ready");
    expect(err.code).toBe("version_not_ready");
  });
});
