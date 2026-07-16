# Codex Skin Store

Bilingual public marketplace for free Codex Desktop themes (English + Simplified Chinese), built with React Router 7 SSR on Cloudflare Workers/D1.

## Local startup

```bash
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

The dev server is typically available at `http://localhost:5173`.

## Community features (consumer loop)

Signed-in community flows use Better Auth OAuth. Pre-auth actions create single-use **auth intents** (10-minute TTL, SHA-256 token hash in D1) so download, copy prompt, favorite, comment, and report can resume after sign-in.

| Feature          | Notes                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| Download         | Worker-proxied zip from private `PACKAGES` R2; key always from D1, never request input |
| Copy prompt      | Post-auth confirmation button only — no automatic clipboard write after OAuth          |
| Favorites        | Idempotent add/remove, personal library at `/:locale/me/favorites` (`noindex`)         |
| Comments         | First-level plain text (max 1000 code points), works without JS                        |
| Reports          | Controlled reasons; rate-limited; does not auto-hide content                           |
| Trends           | Append-only engagement events; scheduled counter/trend reconciliation                  |
| Account deletion | Typed confirmation; anonymizes comments/events; unlists owned themes                   |

GIF uploads, payments, ratings, and DMs remain out of scope for this MVP.

## Admin / release tooling

| Path / command | Notes |
| --- | --- |
| `/:locale/admin/reports` | Moderator console (`noindex`) |
| `/:locale/admin/theme` | Theme/comment remove/restore |
| `/:locale/admin/user` | Admin-only upload suspend + roles |
| `/:locale/admin/seo-landings` | Controlled landing registry |
| `/:locale/admin/analytics-export` | Admin-only metrics JSON/CSV |
| `/:locale/copyright/report` | Public copyright claim form |
| `/:locale/l/:slug` | Programmatic SEO landing (registry only) |
| `npm run audit:seo-landings` | Hreflang/eligibility audit |
| `npm run export:metrics` | Fixture metrics dry-run |
| `npm run release:check` | Local format/lint/typecheck/test/build gates |

Runbooks: `docs/runbooks/{moderation,takedown,seo-rollout,deployment}.md`.

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run audit:seo-landings
npm run release:check -- --skip-e2e
```

Playwright projects cover desktop (1440×900), mobile (390×844), and JavaScript-disabled SSR content. Auth-gated e2e flows and axe release suites are skipped until a local auth fixture is wired; prefer `npm run test:workers` for gated delivery/favorites/comments/reports/moderation.

Browsers can be installed with:

```bash
npx playwright install chromium
```

## Remote Cloudflare operations

Remote resource creation, secrets, D1 migrations against production, Search Console submission, and deployment require **explicit approval** and real Cloudflare account/resource IDs. See `docs/runbooks/deployment.md` and `.dev.vars.example` (names only). Placeholder database IDs in `wrangler.json` are for local development only—do not deploy with them.

## Security headers

Production static headers live in `public/_headers` (nosniff, referrer policy, permissions policy, and a CSP compatible with self-hosted React Router assets).
