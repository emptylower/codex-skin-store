import { env } from "cloudflare:workers";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import CreatorProfile, { loader as creatorLoader } from "~/routes/creator-profile";
import PolicyPage, { loader as policyLoader } from "~/routes/policy-page";
import TaxonomyHub, { loader as taxonomyLoader } from "~/routes/taxonomy-hub";
import ThemeDetail, { loader as themeLoader } from "~/routes/theme-detail";

const NOW = 1_700_300_000_000;

async function insertUser(
  id: string,
  handle: string,
  displayName: string,
  bio = "",
) {
  await env.DB.prepare(
    `INSERT INTO users (id, handle, display_name, bio, role, upload_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'user', 'active', ?, ?)`,
  )
    .bind(id, handle, displayName, bio, NOW, NOW)
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

async function insertTaxonomyTranslation(
  id: string,
  taxonomyId: string,
  locale: string,
  label: string,
) {
  await env.DB.prepare(
    `INSERT INTO taxonomy_translations (
       id, taxonomy_id, locale, label, synonyms_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, '[]', ?, ?)`,
  )
    .bind(id, taxonomyId, locale, label, NOW, NOW)
    .run();
}

async function linkTaxonomy(themeId: string, taxonomyId: string) {
  await env.DB.prepare(
    `INSERT INTO theme_taxonomies (theme_id, taxonomy_id) VALUES (?, ?)`,
  )
    .bind(themeId, taxonomyId)
    .run();
}

async function insertTheme(options: {
  id: string;
  authorId: string;
  slug: string;
  name: string;
  description: string;
  platform: string;
  mode: string;
  media: string;
  visibility?: string;
  moderationStatus?: string;
  packageStatus?: string;
  packageKey?: string | null;
  payloadDigest?: string | null;
  archiveDigest?: string | null;
  license?: string;
  favorites?: number;
  downloads?: number;
}) {
  const {
    id,
    authorId,
    slug,
    name,
    description,
    platform,
    mode,
    media,
    visibility = "public",
    moderationStatus = "clean",
    packageStatus = "ready",
    packageKey = "packages/test.zip",
    payloadDigest = "sha256:payload-test",
    archiveDigest = "sha256:archive-test",
    license = "CC-BY-4.0",
    favorites = 10,
    downloads = 20,
  } = options;

  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES (?, ?, ?, 'en', 1, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      authorId,
      slug,
      visibility,
      moderationStatus,
      packageStatus,
      favorites,
      downloads,
      NOW,
      NOW,
    )
    .run();

  const manifest = JSON.stringify({
    platform,
    mode,
    media,
    license,
    previewImage: `/demo-themes/${slug}-cover.svg`,
    coverImage: `/demo-themes/${slug}.png`,
    palette: {
      bg: "#0b1020",
      fg: "#f8fafc",
      accent: "#22d3ee",
      muted: "#94a3b8",
    },
    focalPoint: { x: 0.42, y: 0.31 },
    overlay: 0.35,
  });

  await env.DB.prepare(
    `INSERT INTO theme_versions (
       id, theme_id, version, manifest_json, package_key,
       payload_digest, archive_digest,
       published_at, created_at, updated_at
     ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `tv-${id}`,
      id,
      manifest,
      packageKey,
      payloadDigest,
      archiveDigest,
      NOW,
      NOW,
      NOW,
    )
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
      name,
      `${name} summary`,
      description,
      NOW,
      NOW,
    )
    .run();
}

function themeLoaderArgs(url: string, locale: string, slug: string) {
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

function creatorLoaderArgs(url: string, locale: string, handle: string) {
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

function taxonomyLoaderArgs(
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

function policyLoaderArgs(url: string, locale: string, page: string) {
  return {
    request: new Request(url),
    params: { locale, page },
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
  } as unknown as Parameters<typeof policyLoader>[0];
}

beforeAll(async () => {
  await insertUser("user-pp-nova", "nova-chen", "Nova Chen", "Neon nights.");
  await insertUser("user-pp-lin", "lin-park", "Lin Park", "Paper and light.");

  await insertTaxonomy("tax-pp-neon", "style", "neon");
  await insertTaxonomy("tax-pp-minimal", "style", "minimal");
  await insertTaxonomyTranslation(
    "tt-pp-neon-en",
    "tax-pp-neon",
    "en",
    "Neon",
  );
  await insertTaxonomyTranslation(
    "tt-pp-minimal-en",
    "tax-pp-minimal",
    "en",
    "Minimal",
  );

  await insertTheme({
    id: "theme-pp-aurora",
    authorId: "user-pp-nova",
    slug: "pp-aurora-drive",
    name: "Aurora Drive",
    description:
      "Aurora Drive unique description for public theme detail coverage.",
    platform: "both",
    mode: "dark",
    media: "static",
    downloads: 120,
  });
  await linkTaxonomy("theme-pp-aurora", "tax-pp-neon");

  await insertTheme({
    id: "theme-pp-related",
    authorId: "user-pp-nova",
    slug: "pp-neon-sibling",
    name: "Neon Sibling",
    description: "Related neon sibling theme description.",
    platform: "macos",
    mode: "dark",
    media: "static",
    downloads: 80,
  });
  await linkTaxonomy("theme-pp-related", "tax-pp-neon");

  await insertTheme({
    id: "theme-pp-public-lin",
    authorId: "user-pp-lin",
    slug: "pp-paper-lane",
    name: "Paper Lane",
    description: "Public paper theme for creator profile.",
    platform: "macos",
    mode: "light",
    media: "static",
    downloads: 40,
  });
  await linkTaxonomy("theme-pp-public-lin", "tax-pp-minimal");

  // Private/unlisted theme must not appear on creator profile.
  await insertTheme({
    id: "theme-pp-unlisted-lin",
    authorId: "user-pp-lin",
    slug: "pp-secret-draft",
    name: "Secret Draft",
    description: "Should stay off public creator pages.",
    platform: "both",
    mode: "light",
    media: "static",
    visibility: "unlisted",
    downloads: 999,
  });
});

describe("public theme detail", () => {
  it("renders description, preview, facts, package overview, author, and related", async () => {
    const data = await themeLoader(
      themeLoaderArgs(
        "http://localhost/en/themes/pp-aurora-drive",
        "en",
        "pp-aurora-drive",
      ),
    );

    const html = renderToStaticMarkup(
      <ThemeDetail
        loaderData={data}
        params={{ locale: "en", slug: "pp-aurora-drive" }}
        matches={[] as never}
      />,
    );

    expect(html).toContain(
      "Aurora Drive unique description for public theme detail coverage.",
    );
    expect(html).toContain("Aurora Drive");
    expect(html).toContain('role="tablist"');
    expect(html).toContain(data.messages.preview.home);
    expect(html).toContain(data.messages.preview.task);
    expect(html).toMatch(/both|macos|windows/i);
    expect(html).toContain("#0b1020");
    expect(html).toContain("0.42");
    expect(html).toContain("0.31");
    expect(html).toContain("CC-BY-4.0");
    expect(html).toContain("1");
    expect(html).toContain("packages/test.zip");
    expect(html).toContain("sha256:payload-test");
    expect(html).toContain("sha256:archive-test");
    expect(html).toContain("Nova Chen");
    expect(html).toContain("/en/creators/nova-chen");
    expect(html).toContain("Neon Sibling");
    expect(html).toContain(data.messages.theme.related);
    // No gated actions yet (Milestone 3). "Downloads" count labels may still appear.
    expect(html).not.toContain(`>${data.messages.actions.download}<`);
    expect(html).not.toContain(data.messages.actions.copyPrompt);
    expect(html).not.toMatch(/sign[- ]?in/i);
    expect(html).not.toMatch(/roadmap/i);
  });

  it("404s for unknown locale and missing theme", async () => {
    await expect(
      themeLoader(
        themeLoaderArgs(
          "http://localhost/fr/themes/pp-aurora-drive",
          "fr",
          "pp-aurora-drive",
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      themeLoader(
        themeLoaderArgs(
          "http://localhost/en/themes/does-not-exist",
          "en",
          "does-not-exist",
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("public creator profile", () => {
  it("exposes only public themes for the creator", async () => {
    const data = await creatorLoader(
      creatorLoaderArgs(
        "http://localhost/en/creators/lin-park",
        "en",
        "lin-park",
      ),
    );

    expect(data.creator.themes.map((t) => t.slug)).toEqual(["pp-paper-lane"]);

    const html = renderToStaticMarkup(
      <CreatorProfile
        loaderData={data}
        params={{ locale: "en", handle: "lin-park" }}
        matches={[] as never}
      />,
    );

    expect(html).toContain("Lin Park");
    expect(html).toContain("Paper Lane");
    expect(html).not.toContain("Secret Draft");
    expect(html).not.toContain("pp-secret-draft");
  });

  it("404s for unknown creator", async () => {
    await expect(
      creatorLoader(
        creatorLoaderArgs(
          "http://localhost/en/creators/missing-user",
          "en",
          "missing-user",
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("taxonomy hub", () => {
  it("lists themes for a controlled single-dimension taxonomy", async () => {
    const data = await taxonomyLoader(
      taxonomyLoaderArgs(
        "http://localhost/en/taxonomies/style/neon",
        "en",
        "style",
        "neon",
      ),
    );

    const html = renderToStaticMarkup(
      <TaxonomyHub
        loaderData={data}
        params={{ locale: "en", dimension: "style", key: "neon" }}
        matches={[] as never}
      />,
    );

    expect(html).toContain("Neon");
    expect(html).toContain("Aurora Drive");
    expect(html).toContain("Neon Sibling");
    expect(html).not.toContain("Paper Lane");
  });

  it("404s for unknown locale, dimension, or taxonomy key", async () => {
    await expect(
      taxonomyLoader(
        taxonomyLoaderArgs(
          "http://localhost/fr/taxonomies/style/neon",
          "fr",
          "style",
          "neon",
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      taxonomyLoader(
        taxonomyLoaderArgs(
          "http://localhost/en/taxonomies/genre/neon",
          "en",
          "genre",
          "neon",
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      taxonomyLoader(
        taxonomyLoaderArgs(
          "http://localhost/en/taxonomies/style/not-a-real-key",
          "en",
          "style",
          "not-a-real-key",
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("policy pages", () => {
  it("renders reviewed bilingual policy content", async () => {
    for (const page of ["terms", "privacy", "copyright", "about"] as const) {
      const data = await policyLoader(
        policyLoaderArgs(`http://localhost/en/policies/${page}`, "en", page),
      );
      const html = renderToStaticMarkup(
        <PolicyPage
          loaderData={data}
          params={{ locale: "en", page }}
          matches={[] as never}
        />,
      );
      expect(html).toContain(data.messages.policy[page]);
      expect(html.length).toBeGreaterThan(80);
    }
  });

  it("404s for unknown policy slug or locale", async () => {
    await expect(
      policyLoader(
        policyLoaderArgs("http://localhost/en/policies/cookies", "en", "cookies"),
      ),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      policyLoader(
        policyLoaderArgs("http://localhost/fr/policies/terms", "fr", "terms"),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
