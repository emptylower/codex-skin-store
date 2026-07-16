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

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Playwright projects cover desktop (1440×900), mobile (390×844), and JavaScript-disabled SSR content. Browsers can be installed with:

```bash
npx playwright install chromium
```

## Remote Cloudflare operations

Remote resource creation, D1 migrations against production, and deployment require **explicit approval** and real Cloudflare account/resource IDs. Placeholder database IDs in `wrangler.json` are for local development only—do not deploy with them.

## Security headers

Production static headers live in `public/_headers` (nosniff, referrer policy, permissions policy, and a CSP compatible with self-hosted React Router assets).
