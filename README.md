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

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Playwright projects cover desktop (1440×900), mobile (390×844), and JavaScript-disabled SSR content. Auth-gated e2e flows are skipped until a local auth fixture is wired; prefer `npm run test:workers` for gated delivery/favorites/comments/reports.

Browsers can be installed with:

```bash
npx playwright install chromium
```

## Remote Cloudflare operations

Remote resource creation, D1 migrations against production, and deployment require **explicit approval** and real Cloudflare account/resource IDs. Placeholder database IDs in `wrangler.json` are for local development only—do not deploy with them.

## Security headers

Production static headers live in `public/_headers` (nosniff, referrer policy, permissions policy, and a CSP compatible with self-hosted React Router assets).
