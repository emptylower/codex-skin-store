import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createR2PackageStore,
  streamPackageDownload,
} from "~/platform/cloudflare/package-download.server";
import {
  authorizePackageDownload,
  DeliveryError,
} from "~/services/engagement/delivery.server";

const NOW = 1_730_000_000_000;

async function seedReadyTheme(options?: {
  slug?: string;
  visibility?: string;
  moderation?: string;
  packageStatus?: string;
  packageKey?: string | null;
}) {
  const slug = options?.slug ?? `deliv-${crypto.randomUUID().slice(0, 8)}`;
  const userId = `u-${slug}`;
  const themeId = `t-${slug}`;
  await env.DB.prepare(
    `INSERT INTO users (id, handle, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(userId, slug, slug, NOW, NOW)
    .run();

  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES (?, ?, ?, 'en', 1, ?, ?, ?, 0, 0, ?, ?)`,
  )
    .bind(
      themeId,
      userId,
      slug,
      options?.visibility ?? "public",
      options?.moderation ?? "clean",
      options?.packageStatus ?? "ready",
      NOW,
      NOW,
    )
    .run();

  const packageKey =
    options?.packageKey === null
      ? null
      : (options?.packageKey ?? `packages/${themeId}/1/theme.zip`);

  await env.DB.prepare(
    `INSERT INTO theme_versions (
       id, theme_id, version, manifest_json, package_key, created_at, updated_at,
       generation_state
     ) VALUES (?, ?, 1, ?, ?, ?, ?, 'ready')`,
  )
    .bind(
      `v-${themeId}`,
      themeId,
      JSON.stringify({
        platform: "both",
        mode: "dark",
        media: "static",
      }),
      packageKey,
      NOW,
      NOW,
    )
    .run();

  return { slug, themeId, packageKey };
}

describe("delivery authorization", () => {
  it("authorizes public clean ready current packages from D1 keys only", async () => {
    const { slug, packageKey } = await seedReadyTheme();
    if (!packageKey) throw new Error("expected key");
    await env.PACKAGES.put(packageKey, "PK\x03\x04zip-bytes");

    const auth = await authorizePackageDownload(env.DB, { slug });
    expect(auth.packageKey).toBe(packageKey);
    expect(auth.slug).toBe(slug);

    const response = await streamPackageDownload({
      store: createR2PackageStore(env.PACKAGES),
      packageKey: auth.packageKey,
      slug: auth.slug,
      request: new Request("https://example.test/download", {
        method: "GET",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Disposition")).toContain(
      `codex-theme-${slug}.zip`,
    );
    const body = await response.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);
  });

  it("rejects unlisted, removed, processing, and missing package keys", async () => {
    const unlisted = await seedReadyTheme({
      slug: `u-${crypto.randomUUID().slice(0, 6)}`,
      visibility: "unlisted",
    });
    await expect(
      authorizePackageDownload(env.DB, { slug: unlisted.slug }),
    ).rejects.toMatchObject({ code: "not_ready" } satisfies Partial<DeliveryError>);

    const removed = await seedReadyTheme({
      slug: `r-${crypto.randomUUID().slice(0, 6)}`,
      moderation: "removed",
    });
    await expect(
      authorizePackageDownload(env.DB, { slug: removed.slug }),
    ).rejects.toMatchObject({ code: "not_ready" });

    const processing = await seedReadyTheme({
      slug: `p-${crypto.randomUUID().slice(0, 6)}`,
      packageStatus: "processing",
    });
    await expect(
      authorizePackageDownload(env.DB, { slug: processing.slug }),
    ).rejects.toMatchObject({ code: "not_ready" });

    const missing = await seedReadyTheme({
      slug: `m-${crypto.randomUUID().slice(0, 6)}`,
      packageKey: null,
    });
    await expect(
      authorizePackageDownload(env.DB, { slug: missing.slug }),
    ).rejects.toMatchObject({ code: "package_missing" });
  });

  it("does not open arbitrary client-supplied R2 keys", async () => {
    const response = await streamPackageDownload({
      store: createR2PackageStore(env.PACKAGES),
      packageKey: "../secrets/evil",
      slug: "evil",
      request: new Request("https://example.test/x"),
    });
    expect(response.status).toBe(404);
  });
});
