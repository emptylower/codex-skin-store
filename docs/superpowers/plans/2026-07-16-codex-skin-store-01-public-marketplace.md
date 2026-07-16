# Public Marketplace and SEO Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a bilingual, server-rendered, crawlable Codex theme marketplace with seeded catalog data, controlled filters, theme/creator pages, and a responsive simulated Codex preview.

**Architecture:** React Router v7 framework mode runs inside a Cloudflare Worker. D1 stores catalog and taxonomy data through request-scoped Drizzle; pure domain modules own slug, theme-state, taxonomy, and SEO rules. Public routes call typed marketplace/SEO services and render useful HTML without client JavaScript.

**Tech Stack:** React 19.2.7, React Router 7.18.1, TypeScript 7.0.2, Cloudflare Vite plugin 1.45.0, Wrangler 4.111.0, Drizzle ORM 0.45.2, Zod 4.4.3, Vitest 4.1.10, Cloudflare Workers Vitest pool 0.18.5, Playwright 1.61.1.

---

## Locked File Map

```text
package.json                         scripts and exact dependency versions
wrangler.json                        Worker and local D1 configuration
vite.config.ts                       Cloudflare + React Router plugins
react-router.config.ts               SSR framework configuration
workers/app.ts                       Worker fetch adapter
app/root.tsx                         document shell, locale metadata, error boundary
app/routes.ts                        explicit route registry
app/styles/app.css                   responsive design tokens and components
app/i18n/config.ts                   locale parsing and fallback
app/i18n/messages/{en,zh-hans}.ts    reviewed UI strings
app/db/client.server.ts              request-scoped Drizzle factory
app/db/schema/catalog.ts             catalog tables
app/db/schema/seo.ts                 taxonomy/landing tables
app/domain/themes/{state,slug}.ts    pure theme rules
app/domain/taxonomy/normalize.ts     controlled synonym mapping
app/services/marketplace/*.server.ts catalog queries
app/services/seo/*.server.ts         metadata and index rules
app/components/theme-preview/*       stable Home/Task simulator
app/routes/*.tsx                     public SSR pages
migrations/0001_catalog.sql          first D1 migration
scripts/seed-local.ts                deterministic bilingual inventory
tests/{unit,integration,routes,seo,e2e}/
```

### Task 1: Initialize and scaffold the Worker

**Files:**

- Preserve: `.gitignore`, `docs/superpowers/**`
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `react-router.config.ts`, `wrangler.json`, `workers/app.ts`, `app/root.tsx`, `app/routes.ts`, `app/routes/home.tsx`, `app/styles/app.css`, `eslint.config.js`, `vitest.config.ts`, `playwright.config.ts`

- [ ] **Step 1: Initialize Git without changing existing files**

Run:

```bash
cd /Users/mac/Desktop/codex-skin-store
git init
git branch -M main
git status --short
```

Expected: `.git/` exists and the existing `.gitignore` and `docs/` files are untracked; no file is deleted.

- [ ] **Step 2: Scaffold outside the project and copy only the official v7 starter files**

Run:

```bash
rm -rf /tmp/codex-skin-store-starter
npm create cloudflare@2.70.11 -- --template=cloudflare/templates/react-router-starter-template --target-dir /tmp/codex-skin-store-starter
cp -R /tmp/codex-skin-store-starter/app /Users/mac/Desktop/codex-skin-store/
cp -R /tmp/codex-skin-store-starter/workers /Users/mac/Desktop/codex-skin-store/
cp /tmp/codex-skin-store-starter/{package.json,tsconfig.json,vite.config.ts,react-router.config.ts} /Users/mac/Desktop/codex-skin-store/
```

Expected: starter files exist while `docs/` and `.gitignore` remain intact. Do not copy the starter `.git`, README, or Wrangler config.

- [ ] **Step 3: Pin dependencies and scripts**

Set `package.json` scripts and versions to:

```json
{
  "scripts": {
    "dev": "react-router dev",
    "build": "react-router build",
    "preview": "npm run build && vite preview",
    "deploy": "wrangler deploy",
    "typegen": "wrangler types && react-router typegen",
    "typecheck": "npm run typegen && tsc -b",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "test": "npm run test:unit && npm run test:workers",
    "test:unit": "vitest run --config vitest.config.ts",
    "test:workers": "vitest run --config vitest.workers.config.ts",
    "test:watch": "vitest --config vitest.config.ts",
    "test:e2e": "playwright test",
    "db:migrate:local": "wrangler d1 migrations apply codex-skin-store --local",
    "db:seed:local": "wrangler d1 execute codex-skin-store --local --file scripts/seed-local.sql"
  },
  "dependencies": {
    "drizzle-orm": "0.45.2",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "react-router": "7.18.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "1.45.0",
    "@cloudflare/vitest-pool-workers": "0.18.5",
    "@playwright/test": "1.61.1",
    "@react-router/dev": "7.18.1",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "eslint": "10.7.0",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "jsdom": "29.1.1",
    "prettier": "3.6.2",
    "tsx": "4.20.6",
    "typescript": "7.0.2",
    "vite": "8.1.5",
    "vitest": "4.1.10",
    "wrangler": "4.111.0"
  }
}
```

Run `npm install`. Expected: lockfile is created with no unresolved peer dependency.

- [ ] **Step 4: Configure Cloudflare SSR and local D1**

Use this `wrangler.json` baseline:

```json
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "codex-skin-store",
  "main": "./workers/app.ts",
  "compatibility_date": "2026-07-16",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "upload_source_maps": true,
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "codex-skin-store",
      "database_id": "00000000-0000-0000-0000-000000000001",
      "migrations_dir": "migrations"
    }
  ],
  "vars": {
    "APP_ORIGIN": "http://localhost:5173",
    "DEFAULT_LOCALE": "en"
  }
}
```

Keep the Cloudflare and React Router plugins in `vite.config.ts`; set `ssr: true` and `future.unstable_viteEnvironmentApi: true` in `react-router.config.ts`. `workers/app.ts` must pass `{ cloudflare: { env, ctx } }` to `createRequestHandler`.

- [ ] **Step 5: Add import-boundary lint rules**

In `eslint.config.js`, restrict route imports:

```js
{
  files: ["app/routes/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: ["cloudflare:*", "~/db/**", "~/platform/cloudflare/**"]
    }]
  }
}
```

- [ ] **Step 6: Verify scaffold and commit**

Run:

```bash
npm run typecheck
npm run build
git add .
git commit -m "chore: scaffold Cloudflare marketplace"
```

Expected: typecheck/build exit 0 and the first commit includes the approved docs.

### Task 2: Add locale routing and reviewed messages

**Files:**

- Create: `app/i18n/config.ts`, `app/i18n/messages/en.ts`, `app/i18n/messages/zh-hans.ts`, `app/routes/locale-redirect.tsx`, `tests/unit/i18n.test.ts`
- Modify: `app/root.tsx`, `app/routes.ts`

- [ ] **Step 1: Write failing locale tests**

```ts
import { describe, expect, it } from "vitest";
import { parseLocale, localePath } from "~/i18n/config";

describe("locale config", () => {
  it("accepts only launch locales", () => {
    expect(parseLocale("zh-hans")).toBe("zh-hans");
    expect(parseLocale("fr")).toBeNull();
  });
  it("keeps entity slugs unchanged", () => {
    expect(localePath("zh-hans", "/themes/neon-road")).toBe(
      "/zh-hans/themes/neon-road",
    );
  });
});
```

Run `npm run test:unit -- tests/unit/i18n.test.ts`. Expected: FAIL because `config.ts` does not exist.

- [ ] **Step 2: Implement locale contract**

```ts
export const locales = ["en", "zh-hans"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export function parseLocale(value: string): Locale | null {
  return locales.includes(value as Locale) ? (value as Locale) : null;
}
export function localePath(locale: Locale, path = "") {
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}
```

Message files must export the same typed keys: `nav.explore`, `nav.upload`, `actions.download`, `actions.copyPrompt`, `filters.platform`, `preview.home`, `preview.task`, `theme.related`, and policy page labels.

- [ ] **Step 3: Add locale negotiation route and document language**

Register `/` before `/:locale`. Its loader chooses `zh-hans` when `Accept-Language` starts with `zh`, otherwise `en`, and returns a `302` to the prefixed root. In `root.tsx`, derive `<html lang>` from route data; invalid locales return 404, not fallback duplicate content.

- [ ] **Step 4: Run and commit**

Run `npm run test:unit -- tests/unit/i18n.test.ts && npm run typecheck`. Expected: PASS.

```bash
git add app/i18n app/root.tsx app/routes.ts app/routes/locale-redirect.tsx tests/unit/i18n.test.ts
git commit -m "feat(i18n): add locale-first routing"
```

### Task 3: Create catalog schema, migration, and deterministic seed

**Files:**

- Create: `app/db/schema/catalog.ts`, `app/db/schema/seo.ts`, `app/db/client.server.ts`, `migrations/0001_catalog.sql`, `scripts/seed-local.sql`, `tests/integration/catalog-migration.test.ts`, `test/apply-migrations.ts`, `vitest.config.ts`, `vitest.workers.config.ts`, `test/setup-dom.ts`

- [ ] **Step 1: Write failing migration test**

Test that `users`, `themes`, `theme_versions`, `theme_translations`, `taxonomies`, `taxonomy_translations`, `theme_taxonomies`, `seo_landings`, and `seo_landing_translations` exist and that duplicate theme slugs and duplicate taxonomy keys fail.

```ts
const tables = await env.DB.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'",
).all();
expect(tables.results.map((row) => row.name)).toEqual(
  expect.arrayContaining([
    "themes",
    "theme_versions",
    "theme_translations",
    "taxonomies",
  ]),
);
```

Run `npm run test:workers -- tests/integration/catalog-migration.test.ts`. Expected: FAIL because the migration is absent.

- [ ] **Step 2: Define schema with independent state axes**

`0001_catalog.sql` must create a minimal public creator table before `themes`:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','moderator','admin')),
  upload_status TEXT NOT NULL DEFAULT 'active' CHECK(upload_status IN ('active','suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Milestone 2 extends this same `users` table for Better Auth; it must not create a second profile table. `themes` must include:

```sql
id TEXT PRIMARY KEY,
author_id TEXT NOT NULL,
slug TEXT NOT NULL UNIQUE,
source_locale TEXT NOT NULL CHECK(source_locale IN ('en','zh-hans')),
current_version INTEGER,
visibility TEXT NOT NULL CHECK(visibility IN ('draft','public','unlisted','hidden')),
moderation_status TEXT NOT NULL CHECK(moderation_status IN ('clean','flagged','removed')),
package_status TEXT NOT NULL CHECK(package_status IN ('processing','ready','failed')),
favorites_count INTEGER NOT NULL DEFAULT 0,
downloads_count INTEGER NOT NULL DEFAULT 0,
created_at INTEGER NOT NULL,
updated_at INTEGER NOT NULL
```

`theme_versions` in `0001_catalog.sql` is the public seed-compatible base table and must contain `id`, `theme_id`, `version`, `manifest_json`, `package_key`, `payload_digest`, `archive_digest`, `published_at`, `created_at`, and `updated_at`; Milestone 2 extends it with creator upload/generation columns using `ALTER TABLE` and must not recreate it. Add foreign keys and unique constraints for `(theme_id, version)`, `(theme_id, locale)`, `(dimension, key)`, `(taxonomy_id, locale)`, and `(theme_id, taxonomy_id)`. Store platforms and adapter facts in `theme_versions.manifest_json`, not comma-separated theme columns.

- [ ] **Step 3: Configure Workers Vitest migrations**

Use two Vitest configs. `vitest.workers.config.ts` uses `cloudflareTest`, `readD1Migrations`, and `applyD1Migrations` for `tests/integration/**`, `tests/routes/**`, and `tests/seo/**` that need Worker bindings. `vitest.config.ts` uses `environment: "jsdom"` plus `test/setup-dom.ts` for pure domain and React component tests. Add scripts `test:unit` and `test:workers`, and define `test` as both commands in sequence. Augment `ProvidedEnv` with `DB` and `TEST_MIGRATIONS`. Workers storage isolation is per test file; do not assume per-test rollback.

- [ ] **Step 4: Seed real bilingual inventory**

`scripts/seed-local.sql` must use `INSERT ... ON CONFLICT DO UPDATE` / `DO NOTHING` to idempotently insert two creators, controlled taxonomy translations/synonyms, and at least eight public/clean/ready themes with `en` and `zh-hans` translations. Use stable IDs such as `theme-neon-road` and only project-owned demo media under `public/demo-themes/`; do not copy gallery composites from Dream Skin.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run db:migrate:local
npm run db:seed:local
npm run test:workers -- tests/integration/catalog-migration.test.ts
```

Expected: migration applies, rerunning seed makes no duplicates, test passes.

```bash
git add app/db migrations scripts/seed-local.sql test vitest.config.ts vitest.workers.config.ts tests/integration
git commit -m "feat(catalog): add D1 schema and seed data"
```

### Task 4: Implement pure theme and taxonomy rules

**Files:**

- Create: `app/domain/themes/slug.ts`, `app/domain/themes/state.ts`, `app/domain/taxonomy/normalize.ts`, `tests/unit/theme-domain.test.ts`, `tests/unit/taxonomy.test.ts`

- [ ] **Step 1: Write failing rule tests**

Cover lowercase ASCII slug normalization, collision suffixing, immutable published slugs, public eligibility, and synonyms (`sci fi`, `sci-fi`, `科幻` → `science-fiction`).

```ts
expect(
  canDownload({
    visibility: "public",
    moderationStatus: "clean",
    packageStatus: "ready",
  }),
).toBe(true);
expect(
  canDownload({
    visibility: "public",
    moderationStatus: "removed",
    packageStatus: "ready",
  }),
).toBe(false);
```

Run `npm run test:unit -- tests/unit/theme-domain.test.ts tests/unit/taxonomy.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement minimal rules**

```ts
export function canDownload(theme: ThemeState) {
  return (
    theme.visibility === "public" &&
    theme.moderationStatus !== "removed" &&
    theme.packageStatus === "ready"
  );
}
```

`normalizeSlug` strips diacritics, lowercases, replaces non-alphanumeric runs with one hyphen, trims hyphens, caps at 60 characters, and rejects an empty result. `resolveUniqueSlug(base, exists)` tries `base`, then `base-2` through `base-99` and throws after exhaustion.

Taxonomy normalization reads a static canonical synonym map; upload-time suggestions are not accepted as canonical values in this milestone.

- [ ] **Step 3: Verify and commit**

Run `npm run test:unit -- tests/unit/theme-domain.test.ts tests/unit/taxonomy.test.ts`. Expected: PASS.

```bash
git add app/domain tests/unit
git commit -m "feat(domain): add theme and taxonomy rules"
```

### Task 5: Build marketplace query services

**Files:**

- Create: `app/platform/ports.ts`, `app/services/marketplace/types.ts`, `app/services/marketplace/list-themes.server.ts`, `app/services/marketplace/get-theme.server.ts`, `app/services/marketplace/get-creator.server.ts`, `app/services/marketplace/related-themes.server.ts`, `tests/integration/marketplace-queries.test.ts`

- [ ] **Step 1: Write failing query tests**

Seed public, unlisted, removed, untranslated, light/dark, macOS/Windows themes. Assert public queries exclude non-public records, use requested translation only, filter controlled taxonomy, and related themes never include the current theme.

- [ ] **Step 2: Define typed query contract**

```ts
export const marketplaceFilterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  platform: z.enum(["macos", "windows", "both"]).optional(),
  mode: z.enum(["light", "dark"]).optional(),
  media: z.enum(["static", "animated"]).optional(),
  taxonomy: z.array(z.string().max(40)).max(4).default([]),
  sort: z.enum(["trending", "newest", "downloads"]).default("trending"),
});
```

Plan 1's `trending` falls back to downloads then freshness; event-backed trend replaces it in Plan 3.

- [ ] **Step 3: Implement services through a repository port**

`MarketplaceRepository` exposes `list`, `findBySlug`, `findCreator`, and `findRelated`. The Cloudflare implementation may use Drizzle, but routes receive a `MarketplaceService` from `createServices(env)`. No route imports schema files.

- [ ] **Step 4: Verify and commit**

Run `npm run test:workers -- tests/integration/marketplace-queries.test.ts && npm run lint`. Expected: PASS and no restricted-import violations.

```bash
git add app/platform app/services tests/integration/marketplace-queries.test.ts
git commit -m "feat(marketplace): add public catalog queries"
```

### Task 6: Build the theme grid and Codex simulator

**Files:**

- Create: `app/components/theme-card.tsx`, `app/components/filter-bar.tsx`, `app/components/theme-preview/theme-preview.tsx`, `app/components/theme-preview/codex-home.tsx`, `app/components/theme-preview/codex-task.tsx`, `app/routes/marketplace.tsx`, `tests/routes/marketplace.test.tsx`, `tests/unit/theme-preview.test.tsx`
- Modify: `app/styles/app.css`, `app/routes.ts`

- [ ] **Step 1: Write failing component/route tests**

Assert the marketplace heading, eight cards, platform labels, semantic filter controls, and Home/Task tab behavior. Give the preview a stable `aspect-ratio`, bounded height, and labels that remain present when media fails.

- [ ] **Step 2: Implement SSR marketplace**

Register `/:locale` and read filters from `URLSearchParams` through the Zod schema. Invalid filter values return an inline validation state and `noindex`, not a 500.

Cards contain real theme name, creator, platform, mode, media type, and favorite/download counts. Use a reserved media frame with `aspect-ratio: 16 / 10`; do not make page sections floating cards.

- [ ] **Step 3: Implement accessible Home/Task preview**

Use a two-option tablist with keyboard arrow support and actual Codex-like structural elements, not a screenshot overlay. Background style uses validated media URL, focal point, overlay, and palette CSS variables. The simulator contains no fake interactive controls that look actionable without labels.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run test:workers -- tests/routes/marketplace.test.tsx
npm run test:unit -- tests/unit/theme-preview.test.tsx
npm run typecheck
```

Expected: PASS.

```bash
git add app/components app/routes app/styles tests/routes tests/unit/theme-preview.test.tsx
git commit -m "feat(ui): add marketplace and theme simulator"
```

### Task 7: Add theme, creator, taxonomy, and policy pages

**Files:**

- Create: `app/routes/theme-detail.tsx`, `app/routes/creator-profile.tsx`, `app/routes/taxonomy-hub.tsx`, `app/routes/policy-page.tsx`, `app/components/breadcrumbs.tsx`, `app/components/theme-facts.tsx`, `tests/routes/public-pages.test.tsx`
- Modify: `app/routes.ts`

- [ ] **Step 1: Write failing public-page tests**

Assert theme detail contains unique description, preview, compatibility, palette/focal facts, license, version, package overview, author, and related themes. Assert unknown locale/theme/taxonomy returns 404. Assert creator pages expose only public themes.

- [ ] **Step 2: Implement theme detail without fake gated content**

Render the package overview and public installation prerequisites, but omit Download/Copy Prompt controls until Milestone 3 supplies functional authenticated actions. Do not expose nonfunctional sign-in routes or user-visible roadmap text. Exact prompt/package do not exist yet.

- [ ] **Step 3: Implement hubs and policies**

Only controlled single-dimension taxonomy routes are public in this milestone. Render terms, privacy, copyright, and about from reviewed bilingual message modules. Do not introduce arbitrary combination routes.

- [ ] **Step 4: Verify and commit**

Run `npm run test:workers -- tests/routes/public-pages.test.tsx && npm run build`. Expected: PASS.

```bash
git add app/routes app/components tests/routes/public-pages.test.tsx
git commit -m "feat(pages): add public theme and creator routes"
```

### Task 8: Add canonical, hreflang, structured data, robots, and sitemaps

**Files:**

- Create: `app/services/seo/meta.server.ts`, `app/services/seo/index-policy.ts`, `app/services/seo/structured-data.ts`, `app/routes/robots[.]txt.ts`, `app/routes/sitemap[.]xml.ts`, `tests/seo/public-seo.test.ts`, `tests/unit/index-policy.test.ts`
- Modify: public route meta exports, `app/routes.ts`

- [ ] **Step 1: Write failing SEO tests**

For one theme in both locales assert self-canonical, reciprocal `en`/`zh-Hans`, one `x-default` to English, localized title/description, `CreativeWork`, `Person`, and `BreadcrumbList`. Assert query-filter marketplace pages have `noindex,follow` and canonicalize to the locale root.

- [ ] **Step 2: Implement index policy**

```ts
export function isIndexableTheme(theme: ThemeSeoRecord, locale: Locale) {
  return (
    theme.visibility === "public" &&
    theme.moderationStatus !== "removed" &&
    theme.packageStatus === "ready" &&
    theme.translationStatus[locale] === "reviewed"
  );
}
```

Do not emit alternates for incomplete locale variants. Theme canonical always uses the immutable slug.

- [ ] **Step 3: Implement dynamic XML and robots**

Sitemap includes reviewed public theme/creator/taxonomy/policy pages and uses actual `updated_at` for `lastmod`. `robots.txt` points to `/sitemap.xml`; it does not block CSS, images, or public SSR routes.

- [ ] **Step 4: Verify and commit**

Run `npm run test:workers -- tests/seo && npm run test:unit -- tests/unit/index-policy.test.ts`. Expected: PASS with parsed HTML/XML assertions.

```bash
git add app/services/seo app/routes tests/seo tests/unit/index-policy.test.ts
git commit -m "feat(seo): add bilingual crawl foundation"
```

### Task 9: Complete browser, accessibility, and checkpoint verification

**Files:**

- Create: `tests/e2e/public-marketplace.spec.ts`, `tests/e2e/public-seo.spec.ts`, `tests/e2e/accessibility.spec.ts`, `public/_headers`
- Modify: `playwright.config.ts`, `app/styles/app.css`, `README.md`

- [ ] **Step 1: Write failing Playwright flows**

Cover language redirect, search/filter, card-to-detail, Home/Task tabs, creator navigation, 404, mobile 390×844, desktop 1440×900, keyboard-only navigation, and JavaScript-disabled theme content. Parse canonical/hreflang from page source.

- [ ] **Step 2: Add security headers and fix UI failures**

`public/_headers` sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a CSP compatible with generated React Router assets. Preserve visible focus and WCAG AA contrast.

- [ ] **Step 3: Document local startup**

README commands must be exact:

```bash
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Document that remote resource creation/migrations/deployment require explicit approval and real Cloudflare IDs.

- [ ] **Step 4: Run full checkpoint**

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Expected: all exit 0; Playwright passes desktop, mobile, and JS-disabled projects.

- [ ] **Step 5: Commit checkpoint**

```bash
git add README.md public tests/e2e app/styles/app.css playwright.config.ts
git commit -m "test: verify public marketplace checkpoint"
git status --short
```

Expected: clean worktree. Do not deploy yet.
