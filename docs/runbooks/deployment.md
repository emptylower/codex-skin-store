# Deployment Runbook (Approval-Gated)

> **Do not run remote provisioning, secret puts, remote migrations, DNS changes,
> Search Console submission, or production deploy without explicit project-owner
> approval in the same conversation/context.**

This document lists exact commands for Cloudflare Workers + D1 + R2 + Queues.
Placeholder IDs in `wrangler.json` are for **local** development only.

## 0. Local prerequisites

```bash
npm install
npm run db:migrate:local
npm run db:seed:local
npm run release:check -- --skip-e2e   # or full release:check
npm run preview
```

Local smoke: both locales, auth test mode, seeded catalog, upload fixture,
delivery, moderation console (with seeded moderator), SEO sitemap XML, health.

## 1. Resource provisioning (APPROVAL REQUIRED)

```bash
npx wrangler d1 create codex-skin-store
npx wrangler r2 bucket create codex-skin-store-sources
npx wrangler r2 bucket create codex-skin-store-packages
npx wrangler queues create codex-skin-store-packages
npx wrangler queues create codex-skin-store-packages-dlq
```

Update `wrangler.json` with real D1 database_id, R2 bucket names, and queue bindings.

## 2. Secrets (APPROVAL REQUIRED)

Names only — never commit values. See `.dev.vars.example`.

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put TURNSTILE_SECRET
```

Also configure non-secret vars: `APP_ORIGIN`, OAuth client IDs, `R2_ACCOUNT_ID`, Turnstile site key as applicable.

```bash
npx wrangler types
```

## 3. OAuth callbacks

Register for production origin:

- Google / GitHub: `{APP_ORIGIN}/api/auth/callback/google`
- GitHub: `{APP_ORIGIN}/api/auth/callback/github`

## 4. R2 CORS

Configure SOURCES/PACKAGES CORS for browser upload presign only on SOURCES quarantine
prefixes; packages remain worker-proxied (no public read).

## 5. Remote migrations (APPROVAL REQUIRED)

```bash
npx wrangler d1 migrations apply codex-skin-store --remote
```

## 6. Deploy (APPROVAL REQUIRED)

```bash
npm run deploy
```

## 7. Post-deploy

```bash
npx wrangler tail
```

- Verify `/robots.txt`, `/sitemap.xml`
- Verify `/:locale` and `/:locale/themes/:slug`
- Verify admin routes return 401/403 for anonymous/user
- Custom domain + production `APP_ORIGIN` alignment

## 8. Search Console (APPROVAL REQUIRED)

Submit sitemap URL manually. Do not automate from CI.

## 9. Rollback

- Worker: redeploy previous version via Cloudflare dashboard / wrangler versions
- SEO: `UPDATE seo_landings SET index_status = 'paused' WHERE rollout_batch = ?`
- D1: restore from backup snapshot if available (configure backups before launch)

## 10. Monitoring

- `wrangler tail` for 5xx / queue failures
- Metrics export: `/:locale/admin/analytics-export` (admin only)
- SEO rollout: `docs/runbooks/seo-rollout.md`

## Explicit stop points

Before any of the following, stop and obtain owner approval:

1. Remote resource create
2. Secret put
3. Remote migration apply
4. DNS / custom domain
5. `npm run deploy` / `wrangler deploy`
6. Search Console submission
