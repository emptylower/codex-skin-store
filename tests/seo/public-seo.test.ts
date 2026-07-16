import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  loader as creatorLoader,
  meta as creatorMeta,
} from "~/routes/creator-profile";
import {
  loader as marketplaceLoader,
  meta as marketplaceMeta,
} from "~/routes/marketplace";
import { loader as robotsLoader } from "~/routes/robots[.]txt";
import { loader as sitemapLoader } from "~/routes/sitemap[.]xml";
import {
  loader as taxonomyLoader,
  meta as taxonomyMeta,
} from "~/routes/taxonomy-hub";
import {
  loader as themeLoader,
  meta as themeMeta,
} from "~/routes/theme-detail";

const NOW = 1_700_400_000_000;
const ORIGIN = env.APP_ORIGIN;

async function insertUser(id: string, handle: string, displayName: string) {
  await env.DB.prepare(
    `INSERT INTO users (id, handle, display_name, bio, role, upload_status, created_at, updated_at)
     VALUES (?, ?, ?, '', 'user', 'active', ?, ?)`,
  )
    .bind(id, handle, displayName, NOW, NOW)
    .run();
}

async function insertTheme(options: {
  id: string;
  authorId: string;
  slug: string;
  enName: string;
  zhName: string;
  enDescription: string;
  zhDescription: string;
  platform?: string;
  mode?: string;
  media?: string;
  includeZh?: boolean;
  zhStatus?: "draft" | "reviewed";
  updatedAt?: number;
}) {
  const {
    id,
    authorId,
    slug,
    enName,
    zhName,
    enDescription,
    zhDescription,
    platform = "both",
    mode = "dark",
    media = "static",
    includeZh = true,
    zhStatus = "reviewed",
    updatedAt = NOW,
  } = options;

  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES (?, ?, ?, 'en', 1, 'public', 'clean', 'ready', 10, 20, ?, ?)`,
  )
    .bind(id, authorId, slug, NOW, updatedAt)
    .run();

  const manifest = JSON.stringify({
    platform,
    mode,
    media,
    previewImage: `/demo-themes/${slug}-cover.svg`,
    coverImage: `/demo-themes/${slug}.png`,
    palette: {
      bg: "#0b1020",
      fg: "#f8fafc",
      accent: "#22d3ee",
      muted: "#94a3b8",
    },
    focalPoint: { x: 0.5, y: 0.4 },
    overlay: 0.35,
  });

  await env.DB.prepare(
    `INSERT INTO theme_versions (
       id, theme_id, version, manifest_json, package_key,
       payload_digest, archive_digest,
       published_at, created_at, updated_at
     ) VALUES (?, ?, 1, ?, 'packages/test.zip', 'sha256:payload', 'sha256:archive', ?, ?, ?)`,
  )
    .bind(`tv-${id}`, id, manifest, NOW, NOW, updatedAt)
    .run();

  await env.DB.prepare(
    `INSERT INTO theme_translations (
       id, theme_id, locale, name, summary, description,
       translation_status, created_at, updated_at
     ) VALUES (?, ?, 'en', ?, ?, ?, 'reviewed', ?, ?)`,
  )
    .bind(
      `tr-${id}-en`,
      id,
      enName,
      `${enName} summary`,
      enDescription,
      NOW,
      updatedAt,
    )
    .run();

  if (includeZh) {
    await env.DB.prepare(
      `INSERT INTO theme_translations (
         id, theme_id, locale, name, summary, description,
         translation_status, created_at, updated_at
       ) VALUES (?, ?, 'zh-hans', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `tr-${id}-zh`,
        id,
        zhName,
        `${zhName} 摘要`,
        zhDescription,
        zhStatus,
        NOW,
        updatedAt,
      )
      .run();
  }
}

async function insertTaxonomy(
  id: string,
  dimension: string,
  key: string,
  options?: { includeZh?: boolean },
) {
  const includeZh = options?.includeZh ?? true;

  await env.DB.prepare(
    `INSERT INTO taxonomies (id, dimension, key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, dimension, key, NOW, NOW)
    .run();

  await env.DB.prepare(
    `INSERT INTO taxonomy_translations (
       id, taxonomy_id, locale, label, synonyms_json, created_at, updated_at
     ) VALUES (?, ?, 'en', ?, '[]', ?, ?)`,
  )
    .bind(`tt-${id}-en`, id, key, NOW, NOW)
    .run();

  if (includeZh) {
    await env.DB.prepare(
      `INSERT INTO taxonomy_translations (
         id, taxonomy_id, locale, label, synonyms_json, created_at, updated_at
       ) VALUES (?, ?, 'zh-hans', ?, '[]', ?, ?)`,
    )
      .bind(`tt-${id}-zh`, id, key, NOW, NOW)
      .run();
  }
}

async function linkThemeTaxonomy(themeId: string, taxonomyId: string) {
  await env.DB.prepare(
    `INSERT INTO theme_taxonomies (theme_id, taxonomy_id) VALUES (?, ?)`,
  )
    .bind(themeId, taxonomyId)
    .run();
}

function themeArgs(url: string, locale: string, slug: string) {
  return {
    request: new Request(url),
    params: { locale, slug },
    context: {
      cloudflare: {
        env,
        ctx: {
          waitUntil() {},
          passThroughOnException() {},
          props: {},
        },
      },
    },
  } as unknown as Parameters<typeof themeLoader>[0];
}

function marketplaceArgs(url: string, locale: string) {
  return {
    request: new Request(url),
    params: { locale },
    context: {
      cloudflare: {
        env,
        ctx: {
          waitUntil() {},
          passThroughOnException() {},
          props: {},
        },
      },
    },
  } as unknown as Parameters<typeof marketplaceLoader>[0];
}

function creatorArgs(url: string, locale: string, handle: string) {
  return {
    request: new Request(url),
    params: { locale, handle },
    context: {
      cloudflare: {
        env,
        ctx: {
          waitUntil() {},
          passThroughOnException() {},
          props: {},
        },
      },
    },
  } as unknown as Parameters<typeof creatorLoader>[0];
}

function taxonomyArgs(
  url: string,
  locale: string,
  dimension: string,
  key: string,
) {
  return {
    request: new Request(url),
    params: { locale, dimension, key },
    context: {
      cloudflare: {
        env,
        ctx: {
          waitUntil() {},
          passThroughOnException() {},
          props: {},
        },
      },
    },
  } as unknown as Parameters<typeof taxonomyLoader>[0];
}

function resourceArgs(url: string) {
  return {
    request: new Request(url),
    params: {},
    context: {
      cloudflare: {
        env,
        ctx: {
          waitUntil() {},
          passThroughOnException() {},
          props: {},
        },
      },
    },
  } as unknown as Parameters<typeof sitemapLoader>[0];
}

function metaLocation(pathname: string, search = "") {
  return {
    pathname,
    search,
    hash: "",
    state: null,
    key: "default",
  };
}

function findCanonical(tags: Array<Record<string, unknown>>) {
  return tags.find(
    (tag) => tag.tagName === "link" && tag.rel === "canonical",
  ) as { href?: string } | undefined;
}

function findAlternates(tags: Array<Record<string, unknown>>) {
  return tags.filter(
    (tag) => tag.tagName === "link" && tag.rel === "alternate" && tag.hrefLang,
  ) as Array<{ hrefLang: string; href: string }>;
}

function findRobots(tags: Array<Record<string, unknown>>) {
  return tags.find((tag) => tag.name === "robots") as
    | { content?: string }
    | undefined;
}

function findLdJson(tags: Array<Record<string, unknown>>) {
  return tags
    .map((tag) => tag["script:ld+json"])
    .filter(Boolean)
    .flatMap((value) => (Array.isArray(value) ? value : [value])) as Array<
    Record<string, unknown>
  >;
}

beforeAll(async () => {
  await insertUser("user-seo-nova", "seo-nova", "SEO Nova");
  await insertUser("user-seo-lin", "seo-lin", "SEO Lin");

  await insertTheme({
    id: "theme-seo-aurora",
    authorId: "user-seo-nova",
    slug: "seo-aurora-drive",
    enName: "SEO Aurora Drive",
    zhName: "极光驱动",
    enDescription: "English SEO aurora description for bilingual crawl tests.",
    zhDescription: "中文极光主题描述，用于双语收录测试。",
    updatedAt: NOW + 1000,
  });

  // Incomplete zh-hans draft must not emit alternates or sitemap entries for zh.
  await insertTheme({
    id: "theme-seo-draft-zh",
    authorId: "user-seo-lin",
    slug: "seo-draft-zh-only-en",
    enName: "SEO English Only",
    zhName: "未审核中文",
    enDescription: "English only reviewed theme.",
    zhDescription: "草稿中文描述",
    includeZh: true,
    zhStatus: "draft",
    updatedAt: NOW + 2000,
  });

  // Empty hub: controlled key with translations but no public themes linked.
  await insertTaxonomy("tax-seo-empty", "style", "minimal");

  // Populated hub: controlled key linked to bilingual public theme.
  await insertTaxonomy("tax-seo-neon", "style", "neon");
  await linkThemeTaxonomy("theme-seo-aurora", "tax-seo-neon");
});

describe("theme SEO meta", () => {
  it("emits self-canonical, reciprocal hreflang, x-default, and structured data for both locales", async () => {
    const enData = await themeLoader(
      themeArgs(
        `${ORIGIN}/en/themes/seo-aurora-drive`,
        "en",
        "seo-aurora-drive",
      ),
    );
    const zhData = await themeLoader(
      themeArgs(
        `${ORIGIN}/zh-hans/themes/seo-aurora-drive`,
        "zh-hans",
        "seo-aurora-drive",
      ),
    );

    const enTags = themeMeta({
      data: enData,
      params: { locale: "en", slug: "seo-aurora-drive" },
      location: {
        pathname: "/en/themes/seo-aurora-drive",
        search: "",
        hash: "",
        state: null,
        key: "default",
      },
      matches: [] as never,
    }) as Array<Record<string, unknown>>;

    const zhTags = themeMeta({
      data: zhData,
      params: { locale: "zh-hans", slug: "seo-aurora-drive" },
      location: {
        pathname: "/zh-hans/themes/seo-aurora-drive",
        search: "",
        hash: "",
        state: null,
        key: "default",
      },
      matches: [] as never,
    }) as Array<Record<string, unknown>>;

    expect(findCanonical(enTags)?.href).toBe(
      `${ORIGIN}/en/themes/seo-aurora-drive`,
    );
    expect(findCanonical(zhTags)?.href).toBe(
      `${ORIGIN}/zh-hans/themes/seo-aurora-drive`,
    );

    const enAlts = findAlternates(enTags);
    const zhAlts = findAlternates(zhTags);
    const enByLang = Object.fromEntries(
      enAlts.map((alt) => [alt.hrefLang, alt.href]),
    );
    const zhByLang = Object.fromEntries(
      zhAlts.map((alt) => [alt.hrefLang, alt.href]),
    );

    expect(enByLang.en).toBe(`${ORIGIN}/en/themes/seo-aurora-drive`);
    expect(enByLang["zh-Hans"]).toBe(
      `${ORIGIN}/zh-hans/themes/seo-aurora-drive`,
    );
    expect(enByLang["x-default"]).toBe(`${ORIGIN}/en/themes/seo-aurora-drive`);
    expect(zhByLang.en).toBe(`${ORIGIN}/en/themes/seo-aurora-drive`);
    expect(zhByLang["zh-Hans"]).toBe(
      `${ORIGIN}/zh-hans/themes/seo-aurora-drive`,
    );
    expect(zhByLang["x-default"]).toBe(`${ORIGIN}/en/themes/seo-aurora-drive`);

    const enTitle = enTags.find((tag) => "title" in tag) as
      | { title?: string }
      | undefined;
    const zhTitle = zhTags.find((tag) => "title" in tag) as
      | { title?: string }
      | undefined;
    const enDescription = enTags.find((tag) => tag.name === "description") as
      | { content?: string }
      | undefined;
    const zhDescription = zhTags.find((tag) => tag.name === "description") as
      | { content?: string }
      | undefined;

    expect(enTitle?.title).toContain("SEO Aurora Drive");
    expect(zhTitle?.title).toContain("极光驱动");
    expect(enDescription?.content).toContain("English SEO aurora");
    expect(zhDescription?.content).toContain("中文极光主题描述");

    const enLd = findLdJson(enTags);
    const types = enLd.map((node) => node["@type"]);
    expect(types).toContain("CreativeWork");
    expect(types).toContain("Person");
    expect(types).toContain("BreadcrumbList");

    const creative = enLd.find((node) => node["@type"] === "CreativeWork");
    expect(creative?.name).toBe("SEO Aurora Drive");
    const person = enLd.find((node) => node["@type"] === "Person");
    expect(person?.name).toBe("SEO Nova");
  });

  it("does not emit incomplete locale alternates", async () => {
    const enData = await themeLoader(
      themeArgs(
        `${ORIGIN}/en/themes/seo-draft-zh-only-en`,
        "en",
        "seo-draft-zh-only-en",
      ),
    );

    const tags = themeMeta({
      data: enData,
      params: { locale: "en", slug: "seo-draft-zh-only-en" },
      location: {
        pathname: "/en/themes/seo-draft-zh-only-en",
        search: "",
        hash: "",
        state: null,
        key: "default",
      },
      matches: [] as never,
    }) as Array<Record<string, unknown>>;

    const alts = findAlternates(tags);
    const langs = alts.map((alt) => alt.hrefLang);
    expect(langs).toContain("en");
    expect(langs).toContain("x-default");
    expect(langs).not.toContain("zh-Hans");
  });
});

describe("marketplace SEO meta", () => {
  it("noindexes filtered marketplace pages and canonicalizes to locale root", async () => {
    const data = await marketplaceLoader(
      marketplaceArgs(`${ORIGIN}/en?platform=macos&q=neon`, "en"),
    );

    const tags = marketplaceMeta({
      data,
      params: { locale: "en" },
      location: {
        pathname: "/en",
        search: "?platform=macos&q=neon",
        hash: "",
        state: null,
        key: "default",
      },
      matches: [] as never,
    }) as Array<Record<string, unknown>>;

    expect(findRobots(tags)?.content).toMatch(/noindex\s*,\s*follow/i);
    expect(findCanonical(tags)?.href).toBe(`${ORIGIN}/en`);
  });

  it("indexes clean marketplace roots with locale alternates", async () => {
    const data = await marketplaceLoader(marketplaceArgs(`${ORIGIN}/en`, "en"));

    const tags = marketplaceMeta({
      data,
      params: { locale: "en" },
      location: {
        pathname: "/en",
        search: "",
        hash: "",
        state: null,
        key: "default",
      },
      matches: [] as never,
    }) as Array<Record<string, unknown>>;

    expect(findRobots(tags)?.content ?? "index,follow").not.toMatch(/noindex/i);
    expect(findCanonical(tags)?.href).toBe(`${ORIGIN}/en`);
    const alts = findAlternates(tags);
    const byLang = Object.fromEntries(
      alts.map((alt) => [alt.hrefLang, alt.href]),
    );
    expect(byLang.en).toBe(`${ORIGIN}/en`);
    expect(byLang["zh-Hans"]).toBe(`${ORIGIN}/zh-hans`);
    expect(byLang["x-default"]).toBe(`${ORIGIN}/en`);
  });
});

describe("creator SEO meta", () => {
  it("omits zh-Hans hreflang when creator has no public zh themes", async () => {
    // seo-lin only has an English-reviewed public theme (zh translation is draft).
    const data = await creatorLoader(
      creatorArgs(`${ORIGIN}/en/creators/seo-lin`, "en", "seo-lin"),
    );

    const tags = creatorMeta({
      data,
      params: { locale: "en", handle: "seo-lin" },
      location: metaLocation("/en/creators/seo-lin"),
      matches: [] as never,
    }) as Array<Record<string, unknown>>;

    const alts = findAlternates(tags);
    const langs = alts.map((alt) => alt.hrefLang);
    expect(langs).toContain("en");
    expect(langs).toContain("x-default");
    expect(langs).not.toContain("zh-Hans");
  });
});

describe("taxonomy SEO meta", () => {
  it("noindexes empty taxonomy hubs and skips hreflang", async () => {
    const data = await taxonomyLoader(
      taxonomyArgs(
        `${ORIGIN}/en/taxonomies/style/minimal`,
        "en",
        "style",
        "minimal",
      ),
    );

    const tags = taxonomyMeta({
      data,
      params: { locale: "en", dimension: "style", key: "minimal" },
      location: metaLocation("/en/taxonomies/style/minimal"),
      matches: [] as never,
    }) as Array<Record<string, unknown>>;

    expect(findRobots(tags)?.content).toMatch(/noindex\s*,\s*follow/i);
    expect(findAlternates(tags)).toHaveLength(0);
  });

  it("indexes populated taxonomy hubs with reciprocal hreflang", async () => {
    const data = await taxonomyLoader(
      taxonomyArgs(`${ORIGIN}/en/taxonomies/style/neon`, "en", "style", "neon"),
    );

    const tags = taxonomyMeta({
      data,
      params: { locale: "en", dimension: "style", key: "neon" },
      location: metaLocation("/en/taxonomies/style/neon"),
      matches: [] as never,
    }) as Array<Record<string, unknown>>;

    expect(findRobots(tags)?.content ?? "index,follow").not.toMatch(/noindex/i);
    const byLang = Object.fromEntries(
      findAlternates(tags).map((alt) => [alt.hrefLang, alt.href]),
    );
    expect(byLang.en).toBe(`${ORIGIN}/en/taxonomies/style/neon`);
    expect(byLang["zh-Hans"]).toBe(`${ORIGIN}/zh-hans/taxonomies/style/neon`);
    expect(byLang["x-default"]).toBe(`${ORIGIN}/en/taxonomies/style/neon`);
  });
});

describe("robots and sitemap", () => {
  it("serves robots.txt that points at sitemap and does not block public assets", async () => {
    const response = await robotsLoader(resourceArgs(`${ORIGIN}/robots.txt`));
    expect(response).toBeInstanceOf(Response);
    const body = await (response as Response).text();
    expect(body).toContain("Sitemap:");
    expect(body).toContain(`${ORIGIN}/sitemap.xml`);
    expect(body).not.toMatch(/Disallow:\s*\/assets/i);
    expect(body).not.toMatch(/Disallow:\s*\/en/i);
    expect(body).not.toMatch(/Disallow:\s*\*\.css/i);
    expect(body).not.toMatch(/Disallow:\s*\*\.(png|jpg|svg|webp)/i);
  });

  it("includes only indexable theme/creator/taxonomy/policy URLs with lastmod", async () => {
    const response = await sitemapLoader(resourceArgs(`${ORIGIN}/sitemap.xml`));
    expect(response).toBeInstanceOf(Response);
    const body = await (response as Response).text();
    expect((response as Response).headers.get("Content-Type")).toMatch(/xml/i);

    expect(body).toContain(`${ORIGIN}/en`);
    expect(body).toContain(`${ORIGIN}/zh-hans`);
    expect(body).toContain(`${ORIGIN}/en/themes/seo-aurora-drive`);
    expect(body).toContain(`${ORIGIN}/zh-hans/themes/seo-aurora-drive`);
    expect(body).not.toContain(`${ORIGIN}/zh-hans/themes/seo-draft-zh-only-en`);
    expect(body).toContain(`${ORIGIN}/en/themes/seo-draft-zh-only-en`);
    expect(body).toContain(`${ORIGIN}/en/creators/seo-nova`);
    expect(body).toContain(`${ORIGIN}/zh-hans/creators/seo-nova`);
    // Creator with only EN public inventory must not emit zh creator URL.
    expect(body).toContain(`${ORIGIN}/en/creators/seo-lin`);
    expect(body).not.toContain(`${ORIGIN}/zh-hans/creators/seo-lin`);
    // Empty taxonomy hub must be excluded; populated hub included for both locales.
    expect(body).not.toContain(`${ORIGIN}/en/taxonomies/style/minimal`);
    expect(body).not.toContain(`${ORIGIN}/zh-hans/taxonomies/style/minimal`);
    expect(body).toContain(`${ORIGIN}/en/taxonomies/style/neon`);
    expect(body).toContain(`${ORIGIN}/zh-hans/taxonomies/style/neon`);
    expect(body).toContain(`${ORIGIN}/en/terms`);
    expect(body).toContain(`${ORIGIN}/en/privacy`);
    expect(body).toContain(`${ORIGIN}/en/copyright`);
    expect(body).toContain(`${ORIGIN}/en/about`);
    expect(body).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
  });
});
