import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createServices } from "~/services/create-services.server";
import { marketplaceFilterSchema } from "~/services/marketplace/types";

const NOW = 1_700_100_000_000;

async function insertUser(id: string, handle: string, displayName = handle) {
  await env.DB.prepare(
    `INSERT INTO users (id, handle, display_name, bio, role, upload_status, created_at, updated_at)
     VALUES (?, ?, ?, '', 'user', 'active', ?, ?)`,
  )
    .bind(id, handle, displayName, NOW, NOW)
    .run();
}

async function insertTaxonomy(id: string, dimension: string, key: string) {
  await env.DB.prepare(
    `INSERT INTO taxonomies (id, dimension, key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, dimension, key, NOW, NOW)
    .run();
}

async function insertTheme(options: {
  id: string;
  authorId: string;
  slug: string;
  visibility?: string;
  moderationStatus?: string;
  packageStatus?: string;
  currentVersion?: number | null;
  downloads?: number;
  createdAt?: number;
}) {
  const {
    id,
    authorId,
    slug,
    visibility = "public",
    moderationStatus = "clean",
    packageStatus = "ready",
    currentVersion = 1,
    downloads = 10,
    createdAt = NOW,
  } = options;

  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES (?, ?, ?, 'en', ?, ?, ?, ?, 0, ?, ?, ?)`,
  )
    .bind(
      id,
      authorId,
      slug,
      currentVersion,
      visibility,
      moderationStatus,
      packageStatus,
      downloads,
      createdAt,
      createdAt,
    )
    .run();
}

async function insertVersion(
  id: string,
  themeId: string,
  manifest: Record<string, unknown>,
) {
  await env.DB.prepare(
    `INSERT INTO theme_versions (
       id, theme_id, version, manifest_json, package_key,
       published_at, created_at, updated_at
     ) VALUES (?, ?, 1, ?, 'packages/test.zip', ?, ?, ?)`,
  )
    .bind(id, themeId, JSON.stringify(manifest), NOW, NOW, NOW)
    .run();
}

async function insertTranslation(options: {
  id: string;
  themeId: string;
  locale: string;
  name: string;
  summary?: string;
  status?: string;
}) {
  const {
    id,
    themeId,
    locale,
    name,
    summary = `${name} summary`,
    status = "reviewed",
  } = options;

  await env.DB.prepare(
    `INSERT INTO theme_translations (
       id, theme_id, locale, name, summary, description,
       translation_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      themeId,
      locale,
      name,
      summary,
      `${name} description`,
      status,
      NOW,
      NOW,
    )
    .run();
}

async function linkTaxonomy(themeId: string, taxonomyId: string) {
  await env.DB.prepare(
    `INSERT INTO theme_taxonomies (theme_id, taxonomy_id) VALUES (?, ?)`,
  )
    .bind(themeId, taxonomyId)
    .run();
}

beforeAll(async () => {
  await insertUser("user-mq-alice", "alice", "Alice");
  await insertUser("user-mq-bob", "bob", "Bob");

  await insertTaxonomy("tax-mq-neon", "style", "neon");
  await insertTaxonomy("tax-mq-minimal", "style", "minimal");
  await insertTaxonomy("tax-mq-focus", "mood", "focus");
  await insertTaxonomy("tax-mq-dark", "mode", "dark");
  await insertTaxonomy("tax-mq-light", "mode", "light");

  // Public light macOS neon theme
  await insertTheme({
    id: "theme-mq-light-mac",
    authorId: "user-mq-alice",
    slug: "mq-light-mac",
    downloads: 50,
    createdAt: NOW + 1000,
  });
  await insertVersion("tv-mq-light-mac", "theme-mq-light-mac", {
    platform: "macos",
    mode: "light",
    media: "static",
    previewImage: "/demo/light.svg",
    coverImage: "/demo/light.png",
  });
  await insertTranslation({
    id: "tr-mq-light-mac-en",
    themeId: "theme-mq-light-mac",
    locale: "en",
    name: "MQ Light Mac",
  });
  await insertTranslation({
    id: "tr-mq-light-mac-zh",
    themeId: "theme-mq-light-mac",
    locale: "zh-hans",
    name: "浅色 Mac",
  });
  await linkTaxonomy("theme-mq-light-mac", "tax-mq-neon");
  await linkTaxonomy("theme-mq-light-mac", "tax-mq-light");

  // Public dark Windows animated theme
  await insertTheme({
    id: "theme-mq-dark-win",
    authorId: "user-mq-bob",
    slug: "mq-dark-win",
    downloads: 90,
    createdAt: NOW + 2000,
  });
  await insertVersion("tv-mq-dark-win", "theme-mq-dark-win", {
    platform: "windows",
    mode: "dark",
    media: "animated",
    previewImage: "/demo/dark.svg",
    coverImage: "/demo/dark.png",
  });
  await insertTranslation({
    id: "tr-mq-dark-win-en",
    themeId: "theme-mq-dark-win",
    locale: "en",
    name: "MQ Dark Win",
  });
  await insertTranslation({
    id: "tr-mq-dark-win-zh",
    themeId: "theme-mq-dark-win",
    locale: "zh-hans",
    name: "深色 Win",
  });
  await linkTaxonomy("theme-mq-dark-win", "tax-mq-minimal");
  await linkTaxonomy("theme-mq-dark-win", "tax-mq-dark");
  await linkTaxonomy("theme-mq-dark-win", "tax-mq-focus");

  // Public dual-platform theme sharing neon taxonomy (for related + both)
  await insertTheme({
    id: "theme-mq-both",
    authorId: "user-mq-alice",
    slug: "mq-both-shell",
    downloads: 30,
    createdAt: NOW + 3000,
  });
  await insertVersion("tv-mq-both", "theme-mq-both", {
    platform: "both",
    mode: "dark",
    media: "static",
    previewImage: "/demo/both.svg",
    coverImage: "/demo/both.png",
  });
  await insertTranslation({
    id: "tr-mq-both-en",
    themeId: "theme-mq-both",
    locale: "en",
    name: "MQ Both Shell",
  });
  await insertTranslation({
    id: "tr-mq-both-zh",
    themeId: "theme-mq-both",
    locale: "zh-hans",
    name: "双端外壳",
  });
  await linkTaxonomy("theme-mq-both", "tax-mq-neon");
  await linkTaxonomy("theme-mq-both", "tax-mq-dark");

  // Unlisted — must not appear in public list/detail
  await insertTheme({
    id: "theme-mq-unlisted",
    authorId: "user-mq-alice",
    slug: "mq-unlisted",
    visibility: "unlisted",
    downloads: 999,
  });
  await insertVersion("tv-mq-unlisted", "theme-mq-unlisted", {
    platform: "both",
    mode: "light",
    media: "static",
  });
  await insertTranslation({
    id: "tr-mq-unlisted-en",
    themeId: "theme-mq-unlisted",
    locale: "en",
    name: "MQ Unlisted",
  });

  // Removed — must not appear
  await insertTheme({
    id: "theme-mq-removed",
    authorId: "user-mq-bob",
    slug: "mq-removed",
    moderationStatus: "removed",
    downloads: 888,
  });
  await insertVersion("tv-mq-removed", "theme-mq-removed", {
    platform: "macos",
    mode: "dark",
    media: "static",
  });
  await insertTranslation({
    id: "tr-mq-removed-en",
    themeId: "theme-mq-removed",
    locale: "en",
    name: "MQ Removed",
  });

  // Public but English translation only draft / missing reviewed en
  await insertTheme({
    id: "theme-mq-untranslated",
    authorId: "user-mq-bob",
    slug: "mq-untranslated",
    downloads: 40,
  });
  await insertVersion("tv-mq-untranslated", "theme-mq-untranslated", {
    platform: "macos",
    mode: "light",
    media: "static",
  });
  await insertTranslation({
    id: "tr-mq-untranslated-en",
    themeId: "theme-mq-untranslated",
    locale: "en",
    name: "MQ Draft Only",
    status: "draft",
  });
  await insertTranslation({
    id: "tr-mq-untranslated-zh",
    themeId: "theme-mq-untranslated",
    locale: "zh-hans",
    name: "仅中文",
    status: "reviewed",
  });

  // package_status processing — excluded from public results
  await insertTheme({
    id: "theme-mq-processing",
    authorId: "user-mq-alice",
    slug: "mq-processing",
    packageStatus: "processing",
    downloads: 77,
  });
  await insertVersion("tv-mq-processing", "theme-mq-processing", {
    platform: "both",
    mode: "dark",
    media: "static",
  });
  await insertTranslation({
    id: "tr-mq-processing-en",
    themeId: "theme-mq-processing",
    locale: "en",
    name: "MQ Processing",
  });

  // package_status failed — excluded
  await insertTheme({
    id: "theme-mq-failed",
    authorId: "user-mq-alice",
    slug: "mq-failed",
    packageStatus: "failed",
    downloads: 66,
  });
  await insertVersion("tv-mq-failed", "theme-mq-failed", {
    platform: "both",
    mode: "dark",
    media: "static",
  });
  await insertTranslation({
    id: "tr-mq-failed-en",
    themeId: "theme-mq-failed",
    locale: "en",
    name: "MQ Failed",
  });

  // visibility draft — excluded
  await insertTheme({
    id: "theme-mq-draft",
    authorId: "user-mq-bob",
    slug: "mq-draft",
    visibility: "draft",
    downloads: 55,
  });
  await insertVersion("tv-mq-draft", "theme-mq-draft", {
    platform: "macos",
    mode: "light",
    media: "static",
  });
  await insertTranslation({
    id: "tr-mq-draft-en",
    themeId: "theme-mq-draft",
    locale: "en",
    name: "MQ Draft",
  });

  // visibility hidden — excluded
  await insertTheme({
    id: "theme-mq-hidden",
    authorId: "user-mq-bob",
    slug: "mq-hidden",
    visibility: "hidden",
    downloads: 44,
  });
  await insertVersion("tv-mq-hidden", "theme-mq-hidden", {
    platform: "windows",
    mode: "dark",
    media: "static",
  });
  await insertTranslation({
    id: "tr-mq-hidden-en",
    themeId: "theme-mq-hidden",
    locale: "en",
    name: "MQ Hidden",
  });

  // current_version null — excluded even if a version row exists
  await insertTheme({
    id: "theme-mq-no-current",
    authorId: "user-mq-alice",
    slug: "mq-no-current",
    currentVersion: null,
    downloads: 33,
  });
  await insertVersion("tv-mq-no-current", "theme-mq-no-current", {
    platform: "both",
    mode: "light",
    media: "static",
  });
  await insertTranslation({
    id: "tr-mq-no-current-en",
    themeId: "theme-mq-no-current",
    locale: "en",
    name: "MQ No Current",
  });

  // Invalid manifest facts (missing media / bad platform) — fail closed
  await insertTheme({
    id: "theme-mq-bad-manifest",
    authorId: "user-mq-bob",
    slug: "mq-bad-manifest",
    downloads: 22,
  });
  await insertVersion("tv-mq-bad-manifest", "theme-mq-bad-manifest", {
    platform: "linux",
    mode: "dark",
  });
  await insertTranslation({
    id: "tr-mq-bad-manifest-en",
    themeId: "theme-mq-bad-manifest",
    locale: "en",
    name: "MQ Bad Manifest",
  });
});

describe("marketplaceFilterSchema", () => {
  it("applies defaults for taxonomy and sort", () => {
    expect(marketplaceFilterSchema.parse({})).toEqual({
      taxonomy: [],
      sort: "trending",
    });
  });

  it("accepts controlled filter values", () => {
    expect(
      marketplaceFilterSchema.parse({
        q: " neon ",
        platform: "macos",
        mode: "dark",
        media: "animated",
        taxonomy: ["sci-fi"],
        sort: "newest",
      }),
    ).toEqual({
      q: "neon",
      platform: "macos",
      mode: "dark",
      media: "animated",
      taxonomy: ["sci-fi"],
      sort: "newest",
    });
  });
});

describe("marketplace public queries", () => {
  const services = createServices(env);

  it("lists only public ready non-removed themes with reviewed locale translation", async () => {
    const result = await services.marketplace.listThemes("en", {});
    const slugs = result.items.map((item) => item.slug).sort();

    expect(slugs).toEqual(["mq-both-shell", "mq-dark-win", "mq-light-mac"]);
    expect(slugs).not.toContain("mq-unlisted");
    expect(slugs).not.toContain("mq-removed");
    expect(slugs).not.toContain("mq-untranslated");
    expect(slugs).not.toContain("mq-processing");
    expect(slugs).not.toContain("mq-failed");
    expect(slugs).not.toContain("mq-draft");
    expect(slugs).not.toContain("mq-hidden");
    expect(slugs).not.toContain("mq-no-current");
    expect(slugs).not.toContain("mq-bad-manifest");
  });

  it("excludes processing and failed package_status from public list and detail", async () => {
    const result = await services.marketplace.listThemes("en", {});
    const slugs = result.items.map((item) => item.slug);

    expect(slugs).not.toContain("mq-processing");
    expect(slugs).not.toContain("mq-failed");
    expect(
      await services.marketplace.getTheme("mq-processing", "en"),
    ).toBeNull();
    expect(await services.marketplace.getTheme("mq-failed", "en")).toBeNull();
  });

  it("excludes draft and hidden visibility from public list and detail", async () => {
    const result = await services.marketplace.listThemes("en", {});
    const slugs = result.items.map((item) => item.slug);

    expect(slugs).not.toContain("mq-draft");
    expect(slugs).not.toContain("mq-hidden");
    expect(await services.marketplace.getTheme("mq-draft", "en")).toBeNull();
    expect(await services.marketplace.getTheme("mq-hidden", "en")).toBeNull();
  });

  it("excludes themes with null current_version from public list and detail", async () => {
    const result = await services.marketplace.listThemes("en", {});
    expect(result.items.map((item) => item.slug)).not.toContain(
      "mq-no-current",
    );
    expect(
      await services.marketplace.getTheme("mq-no-current", "en"),
    ).toBeNull();
  });

  it("excludes themes with invalid manifest platform/mode/media", async () => {
    const result = await services.marketplace.listThemes("en", {});
    expect(result.items.map((item) => item.slug)).not.toContain(
      "mq-bad-manifest",
    );
    expect(
      await services.marketplace.getTheme("mq-bad-manifest", "en"),
    ).toBeNull();
  });

  it("uses only the requested locale translation for list cards", async () => {
    const en = await services.marketplace.listThemes("en", {});
    const zh = await services.marketplace.listThemes("zh-hans", {});

    const enLight = en.items.find((item) => item.slug === "mq-light-mac");
    const zhLight = zh.items.find((item) => item.slug === "mq-light-mac");

    expect(enLight?.name).toBe("MQ Light Mac");
    expect(zhLight?.name).toBe("浅色 Mac");
    expect(enLight?.summary).toContain("MQ Light Mac");
  });

  it("includes themes that only have a reviewed translation for the requested locale", async () => {
    const en = await services.marketplace.listThemes("en", {});
    const zh = await services.marketplace.listThemes("zh-hans", {});

    expect(en.items.map((i) => i.slug)).not.toContain("mq-untranslated");
    expect(zh.items.map((i) => i.slug)).toContain("mq-untranslated");
  });

  it("filters by platform, mode, media, and controlled taxonomy", async () => {
    const macos = await services.marketplace.listThemes("en", {
      platform: "macos",
    });
    expect(macos.items.map((i) => i.slug).sort()).toEqual([
      "mq-both-shell",
      "mq-light-mac",
    ]);

    const dark = await services.marketplace.listThemes("en", { mode: "dark" });
    expect(dark.items.map((i) => i.slug).sort()).toEqual([
      "mq-both-shell",
      "mq-dark-win",
    ]);

    const animated = await services.marketplace.listThemes("en", {
      media: "animated",
    });
    expect(animated.items.map((i) => i.slug)).toEqual(["mq-dark-win"]);

    const neon = await services.marketplace.listThemes("en", {
      taxonomy: ["neon"],
    });
    expect(neon.items.map((i) => i.slug).sort()).toEqual([
      "mq-both-shell",
      "mq-light-mac",
    ]);

    const neonSynonym = await services.marketplace.listThemes("en", {
      taxonomy: ["赛博"],
    });
    expect(neonSynonym.items.map((i) => i.slug).sort()).toEqual([
      "mq-both-shell",
      "mq-light-mac",
    ]);
  });

  it("applies multi-taxonomy filters with AND semantics", async () => {
    const neonAndDark = await services.marketplace.listThemes("en", {
      taxonomy: ["neon", "dark"],
    });
    expect(neonAndDark.items.map((i) => i.slug)).toEqual(["mq-both-shell"]);

    const neonAndMinimal = await services.marketplace.listThemes("en", {
      taxonomy: ["neon", "minimal"],
    });
    expect(neonAndMinimal.items).toEqual([]);
  });

  it("returns empty results when only unknown taxonomy keys are provided", async () => {
    const unknown = await services.marketplace.listThemes("en", {
      taxonomy: ["not-a-real-taxonomy-key"],
    });
    expect(unknown.items).toEqual([]);

    const mixed = await services.marketplace.listThemes("en", {
      taxonomy: ["not-a-real-taxonomy-key", "neon"],
    });
    expect(mixed.items.map((i) => i.slug).sort()).toEqual([
      "mq-both-shell",
      "mq-light-mac",
    ]);
  });

  it("sorts trending by downloads then freshness", async () => {
    const trending = await services.marketplace.listThemes("en", {
      sort: "trending",
    });
    expect(trending.items.map((i) => i.slug)).toEqual([
      "mq-dark-win",
      "mq-light-mac",
      "mq-both-shell",
    ]);

    const newest = await services.marketplace.listThemes("en", {
      sort: "newest",
    });
    expect(newest.items.map((i) => i.slug)).toEqual([
      "mq-both-shell",
      "mq-dark-win",
      "mq-light-mac",
    ]);

    const downloads = await services.marketplace.listThemes("en", {
      sort: "downloads",
    });
    expect(downloads.items.map((i) => i.slug)).toEqual([
      "mq-dark-win",
      "mq-light-mac",
      "mq-both-shell",
    ]);
  });

  it("returns null for non-public or untranslated theme detail", async () => {
    expect(await services.marketplace.getTheme("mq-unlisted", "en")).toBeNull();
    expect(await services.marketplace.getTheme("mq-removed", "en")).toBeNull();
    expect(
      await services.marketplace.getTheme("mq-untranslated", "en"),
    ).toBeNull();
    expect(
      await services.marketplace.getTheme("missing-slug", "en"),
    ).toBeNull();
  });

  it("returns localized public theme detail with creator and manifest facts", async () => {
    const theme = await services.marketplace.getTheme("mq-dark-win", "en");
    expect(theme).not.toBeNull();
    expect(theme?.slug).toBe("mq-dark-win");
    expect(theme?.name).toBe("MQ Dark Win");
    expect(theme?.description).toContain("MQ Dark Win");
    expect(theme?.platform).toBe("windows");
    expect(theme?.mode).toBe("dark");
    expect(theme?.media).toBe("animated");
    expect(theme?.creator.handle).toBe("bob");
    expect(theme?.creator.displayName).toBe("Bob");
    expect(theme?.taxonomyKeys).toEqual(
      expect.arrayContaining(["minimal", "dark", "focus"]),
    );
    // R2 packageKey must stay server-only (not on public ThemeDetail).
    expect(theme).not.toHaveProperty("packageKey");

    const zh = await services.marketplace.getTheme("mq-dark-win", "zh-hans");
    expect(zh?.name).toBe("深色 Win");
    expect(zh).not.toHaveProperty("packageKey");
  });

  it("returns creator profile with only public listable themes", async () => {
    const creator = await services.marketplace.getCreator("alice", "en");
    expect(creator).not.toBeNull();
    expect(creator?.handle).toBe("alice");
    expect(creator?.displayName).toBe("Alice");

    const slugs = creator?.themes.map((t) => t.slug).sort();
    expect(slugs).toEqual(["mq-both-shell", "mq-light-mac"]);
    expect(slugs).not.toContain("mq-unlisted");

    expect(await services.marketplace.getCreator("missing", "en")).toBeNull();
  });

  it("returns related themes that never include the current theme", async () => {
    const related = await services.marketplace.getRelatedThemes(
      "mq-light-mac",
      "en",
    );

    const slugs = related.map((t) => t.slug);
    expect(slugs).not.toContain("mq-light-mac");
    expect(slugs).not.toContain("mq-unlisted");
    expect(slugs).not.toContain("mq-removed");
    // Shares neon with mq-both-shell
    expect(slugs).toContain("mq-both-shell");
  });
});
