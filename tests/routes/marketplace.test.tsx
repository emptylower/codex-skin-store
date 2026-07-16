import { env } from "cloudflare:workers";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import Marketplace, {
  loader,
  meta,
} from "~/routes/marketplace";

const NOW = 1_700_200_000_000;

const THEME_NAMES = [
  "Neon Road",
  "Paper Studio",
  "Midnight Harbor",
  "Solar Grove",
  "Frost Terminal",
  "Amber Atelier",
  "Pixel Arcade",
  "Ink Scroll",
] as const;

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
  name: string;
  platform: string;
  mode: string;
  media: string;
  favorites?: number;
  downloads?: number;
  previewImage?: string;
  coverImage?: string;
}) {
  const {
    id,
    authorId,
    slug,
    name,
    platform,
    mode,
    media,
    favorites = 10,
    downloads = 20,
    previewImage = `/demo-themes/${slug}-cover.svg`,
    coverImage = `/demo-themes/${slug}.png`,
  } = options;

  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES (?, ?, ?, 'en', 1, 'public', 'clean', 'ready', ?, ?, ?, ?)`,
  )
    .bind(id, authorId, slug, favorites, downloads, NOW, NOW)
    .run();

  const manifest = JSON.stringify({
    platform,
    mode,
    media,
    previewImage,
    coverImage,
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
       published_at, created_at, updated_at
     ) VALUES (?, ?, 1, ?, 'packages/test.zip', ?, ?, ?)`,
  )
    .bind(`tv-${id}`, id, manifest, NOW, NOW, NOW)
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
      `${name} description`,
      NOW,
      NOW,
    )
    .run();
}

function loaderArgs(url: string, locale = "en") {
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
    // Unused RR fields for unit-style loader invocation
  } as unknown as Parameters<typeof loader>[0];
}

beforeAll(async () => {
  await insertUser("user-mkt-nova", "nova-chen", "Nova Chen");
  await insertUser("user-mkt-lin", "lin-park", "Lin Park");

  const fixtures: Array<{
    slug: string;
    name: (typeof THEME_NAMES)[number];
    authorId: string;
    platform: string;
    mode: string;
    media: string;
  }> = [
    {
      slug: "neon-road",
      name: "Neon Road",
      authorId: "user-mkt-nova",
      platform: "both",
      mode: "dark",
      media: "static",
    },
    {
      slug: "paper-studio",
      name: "Paper Studio",
      authorId: "user-mkt-lin",
      platform: "macos",
      mode: "light",
      media: "static",
    },
    {
      slug: "midnight-harbor",
      name: "Midnight Harbor",
      authorId: "user-mkt-nova",
      platform: "windows",
      mode: "dark",
      media: "static",
    },
    {
      slug: "solar-grove",
      name: "Solar Grove",
      authorId: "user-mkt-lin",
      platform: "both",
      mode: "light",
      media: "static",
    },
    {
      slug: "frost-terminal",
      name: "Frost Terminal",
      authorId: "user-mkt-nova",
      platform: "macos",
      mode: "dark",
      media: "static",
    },
    {
      slug: "amber-atelier",
      name: "Amber Atelier",
      authorId: "user-mkt-lin",
      platform: "windows",
      mode: "light",
      media: "static",
    },
    {
      slug: "pixel-arcade",
      name: "Pixel Arcade",
      authorId: "user-mkt-nova",
      platform: "both",
      mode: "dark",
      media: "static",
    },
    {
      slug: "ink-scroll",
      name: "Ink Scroll",
      authorId: "user-mkt-lin",
      platform: "macos",
      mode: "light",
      media: "static",
    },
  ];

  for (const fixture of fixtures) {
    await insertTheme({
      id: `theme-mkt-${fixture.slug}`,
      authorId: fixture.authorId,
      slug: fixture.slug,
      name: fixture.name,
      platform: fixture.platform,
      mode: fixture.mode,
      media: fixture.media,
    });
  }
});

describe("marketplace route", () => {
  it("loads eight public themes and renders heading, cards, and filters", async () => {
    const data = await loader(loaderArgs("http://localhost/en"));
    expect(data.filterError).toBe(false);
    expect(data.themes).toHaveLength(8);

    const html = renderToStaticMarkup(
      <Marketplace
        loaderData={data}
        params={{ locale: "en" }}
        matches={[] as never}
      />,
    );

    expect(html).toContain(data.messages.marketplace.heading);
    for (const name of THEME_NAMES) {
      expect(html).toContain(name);
    }
    expect(html).toMatch(/macos|windows|both/i);
    expect(html).toContain('name="platform"');
    expect(html).toContain('name="mode"');
    expect(html).toContain('name="media"');
    expect(html).toContain('name="sort"');
    expect(html).toContain('name="q"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain(data.messages.preview.home);
    expect(html).toContain(data.messages.preview.task);
    expect(html).toContain("theme-card");
    expect(html).toMatch(/aspect-ratio:\s*16\s*\/\s*10/);
  });

  it("returns inline validation state and noindex for invalid filters", async () => {
    const data = await loader(
      loaderArgs("http://localhost/en?platform=amiga&mode=sepia"),
    );
    expect(data.filterError).toBe(true);
    expect(data.themes).toEqual([]);
    expect(data.filters).toBeNull();

    const tags = meta({
      data,
      params: { locale: "en" },
      location: {
        pathname: "/en",
        search: "?platform=amiga",
        hash: "",
        state: null,
        key: "default",
      },
      matches: [] as never,
    });

    const robots = tags.find(
      (tag) =>
        "name" in tag &&
        tag.name === "robots" &&
        "content" in tag &&
        typeof tag.content === "string",
    ) as { content?: string } | undefined;
    expect(robots?.content).toMatch(/noindex/i);

    const html = renderToStaticMarkup(
      <Marketplace
        loaderData={data}
        params={{ locale: "en" }}
        matches={[] as never}
      />,
    );
    expect(html).toContain(data.messages.marketplace.filterError);
  });

  it("404s for unknown locales", async () => {
    await expect(loader(loaderArgs("http://localhost/fr", "fr"))).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("applies valid platform filter without error", async () => {
    const data = await loader(loaderArgs("http://localhost/en?platform=macos"));
    expect(data.filterError).toBe(false);
    expect(data.filters?.platform).toBe("macos");
    for (const theme of data.themes) {
      expect(["macos", "both"]).toContain(theme.platform);
    }
  });
});
