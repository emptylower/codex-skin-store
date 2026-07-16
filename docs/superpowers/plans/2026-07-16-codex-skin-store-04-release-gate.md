# Moderation, Programmatic SEO, and Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cumulative MVP releasable with role-protected moderation, copyright intake, reviewed translations, controlled programmatic SEO, analytics, accessibility/security checks, and an approval-gated Cloudflare deployment runbook.

**Architecture:** Moderation and SEO are explicit domain policies, not UI-only checks. Administrators use server-authorized routes backed by immutable audit actions. Programmatic landing pages exist only in a reviewed registry whose eligibility is computed from real catalog inventory; sitemap and hreflang generation consume that registry rather than arbitrary filters.

**Tech Stack:** Existing Milestones 1–3 stack, D1, R2 evidence bucket prefix, Cloudflare Workers, React Router SSR, Zod, Vitest Workers pool, Playwright, axe-core.

---

## Locked File Map

```text
migrations/0004_release_gate.sql
app/db/schema/{moderation,seo,analytics}.ts
app/domain/moderation/policy.ts
app/domain/seo/{eligibility,uniqueness,hreflang}.ts
app/services/moderation/{admin,takedown,audit}.server.ts
app/services/seo/{landings,translations,sitemap}.server.ts
app/services/analytics/metrics.server.ts
app/routes/admin.{reports,theme,user,seo-landings}.tsx
app/routes/copyright-report.tsx
app/routes/seo-landing.tsx
app/routes/analytics-export.ts
app/components/admin/*
app/components/seo/*
scripts/{audit-seo-landings,export-metrics,release-check}.ts
tests/{unit,integration,routes,seo,e2e}/
docs/runbooks/{moderation,takedown,seo-rollout,deployment}.md
```

### Task 1: Extend moderation, SEO review, takedown, and metric schema

**Files:**

- Create: `migrations/0004_release_gate.sql`, `app/db/schema/analytics.ts`, `tests/integration/release-migration.test.ts`
- Modify: `app/db/schema/moderation.ts`, `app/db/schema/seo.ts`

- [ ] **Step 1: Write the failing migration test**

Assert `moderation_actions` is append-only by application policy, `copyright_claims` and `copyright_evidence` exist, SEO landing translations carry review status and uniqueness evidence, and metric queries have required indexes.

- [ ] **Step 2: Add exact schema fields**

```sql
CREATE TABLE copyright_claims (
  id TEXT PRIMARY KEY,
  claimant_email TEXT NOT NULL,
  claimant_name TEXT NOT NULL,
  target_theme_id TEXT NOT NULL,
  rights_basis TEXT NOT NULL,
  statement TEXT NOT NULL,
  signature TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','needs_information','accepted','rejected','withdrawn')),
  assigned_to TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE TABLE copyright_evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

Extend `seo_landings` with `index_status` (`candidate`, `approved`, `paused`, `retired`), `rollout_batch`, `eligibility_json`, `reviewed_by`, and `reviewed_at`. Extend translations with `translation_status` (`draft`, `reviewed`, `stale`), `intro`, `faq_json`, `seo_title`, `seo_description`, and `uniqueness_score`.

- [ ] **Step 3: Apply, test, and commit**

```bash
npm run db:migrate:local
npm run test:workers -- tests/integration/release-migration.test.ts
git add migrations/0004_release_gate.sql app/db/schema tests/integration/release-migration.test.ts
git commit -m "feat(release): add moderation and SEO review schema"
```

Expected: migration and test pass.

### Task 2: Enforce administrator authorization and immutable audit actions

**Files:**

- Create: `app/domain/moderation/policy.ts`, `app/services/moderation/audit.server.ts`, `app/services/moderation/admin.server.ts`, `tests/unit/moderation-policy.test.ts`, `tests/integration/admin-actions.test.ts`

- [ ] **Step 1: Write failing permission tests**

Cover `user`, `moderator`, and `admin` roles. Moderators may resolve reports and hide/restore content; only admins may suspend uploads or change roles. No one may edit/delete an audit action through public service APIs.

```ts
expect(canPerform("moderator", "theme.remove")).toBe(true);
expect(canPerform("moderator", "user.suspend_uploads")).toBe(false);
expect(canPerform("admin", "user.suspend_uploads")).toBe(true);
```

- [ ] **Step 2: Implement server policy and action batching**

Each action validates actor role using a fresh DB session, reads current target state, writes target change and an audit row containing `before_json`, `after_json`, action, reason, actor, and timestamp in one D1 batch. Audit service exposes list/read only.

- [ ] **Step 3: Test state transitions**

Test dismiss report, remove/restore theme, remove/restore comment, and suspend/restore upload permission. Restoration returns to the recorded prior safe state, not blindly to `public`/`visible`.

- [ ] **Step 4: Verify and commit**

Run unit/integration tests. Expected: PASS.

```bash
git add app/domain/moderation app/services/moderation tests
git commit -m "feat(admin): enforce moderation policies and audit"
```

### Task 3: Build the minimal moderation console

**Files:**

- Create: `app/routes/admin.reports.tsx`, `app/routes/admin.theme.tsx`, `app/routes/admin.user.tsx`, `app/components/admin/report-table.tsx`, `app/components/admin/action-form.tsx`, `tests/routes/admin-routes.test.tsx`, `tests/e2e/admin-moderation.spec.ts`
- Modify: `app/routes.ts`

- [ ] **Step 1: Write failing route tests**

Anonymous receives sign-in/403, user receives 403, moderator sees reports, admin sees upload suspension. All admin pages emit `noindex,nofollow` and never expose claimant/report details to unauthorized loaders.

- [ ] **Step 2: Implement server-rendered routes**

Reports support controlled filters (`open`, target type, reason) and cursor pagination. Action forms require CSRF-safe same-origin sessions, a non-empty reason, and an idempotency key. Confirm destructive removal in a native modal/dialog; restoration is explicit.

- [ ] **Step 3: Verify and commit**

Run route tests and Playwright. Expected: PASS for removal and restore with audit row displayed.

```bash
git add app/routes app/components/admin tests
git commit -m "feat(admin): add moderation console"
```

### Task 4: Implement copyright/takedown intake and evidence retention

**Files:**

- Create: `app/services/moderation/takedown.server.ts`, `app/routes/copyright-report.tsx`, `tests/unit/takedown-policy.test.ts`, `tests/integration/takedown.test.ts`, `tests/e2e/takedown.spec.ts`, `docs/runbooks/takedown.md`
- Modify: copyright policy page and R2 object policy

- [ ] **Step 1: Write failing claim tests**

Validate claimant identity fields, exact theme target, rights basis, good-faith/perjury statements, typed signature, Turnstile/rate limit, evidence MIME/size/hash, and duplicate detection. A claim does not automatically expose claimant data or delete evidence.

- [ ] **Step 2: Implement intake**

Evidence uses server-generated `evidence/{claim-id}/{evidence-id}` keys in the private `SOURCES` bucket, never theme package paths. Store SHA-256 and metadata. Accepted claims invoke existing moderation removal and audit services; rejected/withdrawn claims do not restore content automatically if another removal basis exists.

- [ ] **Step 3: Document retention rules**

The runbook states who can view claimant data, how to request more information, accepted/rejected outcomes, evidence retention period, legal escalation, and how restoration is decided. Mark the final legal copy as requiring owner/legal review before production.

- [ ] **Step 4: Verify and commit**

Run tests and commit.

```bash
git add app/services/moderation/takedown.server.ts app/routes/copyright-report.tsx app/routes/policy-page.tsx tests docs/runbooks/takedown.md
git commit -m "feat(copyright): add takedown workflow"
```

### Task 5: Implement translation review and hreflang parity

**Files:**

- Create: `app/domain/seo/hreflang.ts`, `app/services/seo/translations.server.ts`, `tests/unit/hreflang.test.ts`, `tests/seo/translation-parity.test.ts`
- Modify: public route metadata and sitemap service

- [ ] **Step 1: Write failing hreflang tests**

For reviewed `en` and `zh-hans`, require self-reference, reciprocal return tags, and `x-default` to English. For missing/draft/stale Chinese, English must not claim a Chinese alternate, and Chinese must be `noindex` or 404 according to visibility policy.

- [ ] **Step 2: Implement review state**

Structured taxonomy labels remain deterministic. Theme/landing prose can be `draft`, but `reviewed` requires name, description/introduction, SEO title, SEO description, locale-appropriate alt text, and reviewer/timestamp. Source changes mark other reviewed translations `stale` until re-approved.

- [ ] **Step 3: Add parity audit**

`scripts/audit-seo-landings.ts` reports missing alternates, incomplete required sections, stale reviews, invalid ISO codes, canonical mismatch, or missing return links and exits 1 on critical errors.

- [ ] **Step 4: Verify and commit**

Run SEO tests and the audit against seeds. Expected: PASS/exit 0.

```bash
git add app/domain/seo app/services/seo scripts/audit-seo-landings.ts tests
git commit -m "feat(i18n): add translation review and hreflang parity"
```

### Task 6: Implement controlled programmatic landing eligibility

**Files:**

- Create: `app/domain/seo/eligibility.ts`, `app/domain/seo/uniqueness.ts`, `app/services/seo/landings.server.ts`, `app/routes/admin.seo-landings.tsx`, `app/routes/seo-landing.tsx`, `app/components/seo/landing-review.tsx`, `tests/unit/landing-eligibility.test.ts`, `tests/integration/seo-landings.test.ts`, `tests/routes/seo-landing.test.tsx`
- Modify: `app/routes.ts`

- [ ] **Step 1: Write failing eligibility tests**

A locale landing is eligible only with:

```ts
{
  publicReadyThemeCount: 6,
  distinctCreatorCount: 3,
  translationStatus: "reviewed",
  hasIntroduction: true,
  faqCount: 2,
  relatedLandingCount: 2,
  uniquenessScore: 0.4
}
```

Assert five themes, two creators, draft locale, no FAQ, or score `< 0.30` hard-fails. Scores `0.30..<0.40` remain candidate and require explicit admin override with reason; `>=0.40` is normally eligible.

- [ ] **Step 2: Implement normalized uniqueness evidence**

Compare locale landing main-copy tokens against sibling landings after removing navigation/footer and stop words. Store score plus compared landing IDs and algorithm version. This metric supports review; it does not auto-generate prose.

- [ ] **Step 3: Implement registry and admin review**

Only `seo_landings` records route canonically. Filters cannot create registry rows. Admin can approve/pause/retire an eligible candidate, assign rollout batch, and must record an audit reason for overrides. A route with unapproved registry entry returns useful `noindex` content to authorized previewers and 404 publicly.

- [ ] **Step 4: Render standalone landing value**

Each approved page has localized H1/title, reviewed introduction/FAQ, item list of real themes, parent/related hubs, breadcrumbs, and no keyword-swapped filler. URL patterns remain locale-prefixed and under 100 characters.

- [ ] **Step 5: Verify and commit**

Run unit/integration/route tests. Expected: PASS.

```bash
git add app/domain/seo app/services/seo app/routes app/components/seo tests
git commit -m "feat(seo): add controlled landing registry"
```

### Task 7: Complete structured data, sitemaps, and index controls

**Files:**

- Create: `app/services/seo/sitemap.server.ts`, `tests/seo/release-seo.test.ts`
- Modify: `app/services/seo/structured-data.ts`, `app/routes/sitemap[.]xml.ts`, `app/routes/robots[.]txt.ts`, theme/comment/creator/landing routes

- [ ] **Step 1: Write failing release SEO tests**

Assert:

- Theme: `CreativeWork`, creator `Person`, visible `Comment`, `BreadcrumbList`
- Collection: `ItemList`, `BreadcrumbList`
- No `AggregateRating`
- Only public/clean/ready/reviewed theme pages and approved landing batches enter sitemap
- `lastmod` equals actual content update, not request time
- Search/query filters/pagination beyond canonical entry/auth/admin/draft locales are `noindex` and excluded

- [ ] **Step 2: Implement sitemap index and locale alternates**

Split sitemap files before 50,000 URLs, include each locale alternate set with self/return links, and output one `x-default`. During MVP, batches cap active programmatic landing entries to 100; excess approved entries remain paused.

- [ ] **Step 3: Verify HTML and XML**

Run parsed source tests with JavaScript disabled. Expected: reciprocal alternates and valid JSON-LD/XML; no incomplete locale URL leaks.

- [ ] **Step 4: Commit**

```bash
git add app/services/seo app/routes tests/seo
git commit -m "feat(seo): complete structured index controls"
```

### Task 8: Add operational metrics and release targets

**Files:**

- Create: `app/services/analytics/metrics.server.ts`, `app/routes/analytics-export.ts`, `scripts/export-metrics.ts`, `tests/integration/metrics.test.ts`, `docs/runbooks/seo-rollout.md`

- [ ] **Step 1: Write failing metric tests**

Calculate weekly distinct user/theme deliveries, detail→auth start, OAuth completion, auth→delivery, download/prompt mix, seven-day favorite return, public-ready themes, non-admin creator share, package success/latency, comments/reports per 100 deliveries, and indexed/eligible counts.

- [ ] **Step 2: Implement privacy-bounded queries**

Only admin can export aggregate JSON/CSV. Suppress segments with fewer than five users, exclude raw user IDs/tokens/IP hashes/comment text, and use UTC periods. SQL queries have explicit bounds and indexes.

- [ ] **Step 3: Implement staged SEO rollout runbook**

Document 50–100 page batches, Search Console submission, two-to-four-week observation, index coverage/impression/crawl/duplicate checks, pause criteria, rollback by `index_status = 'paused'`, and manual sample review of at least 10%.

- [ ] **Step 4: Verify and commit**

Run metric tests and export against seed data. Expected: stable deterministic fixture values.

```bash
git add app/services/analytics app/routes/analytics-export.ts scripts/export-metrics.ts tests/integration/metrics.test.ts docs/runbooks/seo-rollout.md
git commit -m "feat(analytics): add release metrics and SEO rollout"
```

### Task 9: Run accessibility, security, compatibility, and performance gates

**Files:**

- Create: `tests/e2e/release-accessibility.spec.ts`, `tests/e2e/release-security.spec.ts`, `tests/e2e/release-mobile.spec.ts`, `tests/packages/runtime-compatibility.test.ts`, `scripts/release-check.ts`, `docs/runbooks/moderation.md`
- Modify: `package.json`, affected UI/styles

- [ ] **Step 1: Add automated release checks**

Install and pin `@axe-core/playwright@4.12.1`. Test core routes in both locales at 390×844 and 1440×900, keyboard-only flows, visible focus, dialog semantics, text contrast, no overlap, JS-disabled public content, security headers, CSRF/origin policy, role bypass attempts, error redaction, and hostile route inputs.

- [ ] **Step 2: Validate package compatibility artifacts**

For golden macOS, Windows, and dual packages: verify manifest/adapters/hashes, `unzip -t`, case-fold filename uniqueness, no executable extensions, no uploader prompt, and expected install-template version. Record that Windows Explorer, macOS Archive Utility, and 7-Zip manual smoke checks are required before release if the streaming ZIP implementation declares ZIP64 capability.

- [ ] **Step 3: Add release-check script**

`scripts/release-check.ts` runs or verifies results for formatting, lint, typecheck, tests, build, E2E, SEO audit, migration status (local only), package schema, and seed inventory targets. It exits nonzero with actionable named gates.

- [ ] **Step 4: Run complete local gate**

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npx tsx scripts/audit-seo-landings.ts
npx tsx scripts/release-check.ts
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app tests scripts docs/runbooks/moderation.md
git commit -m "test: enforce MVP release gates"
```

### Task 10: Write and rehearse the approval-gated deployment runbook

**Files:**

- Create: `docs/runbooks/deployment.md`, `.dev.vars.example`
- Modify: `README.md`, `wrangler.json`

- [ ] **Step 1: Document exact resource provisioning without executing it**

The runbook lists:

```bash
npx wrangler d1 create codex-skin-store
npx wrangler r2 bucket create codex-skin-store-sources
npx wrangler r2 bucket create codex-skin-store-packages
npx wrangler queues create codex-skin-store-packages
npx wrangler queues create codex-skin-store-packages-dlq
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put TURNSTILE_SECRET
npx wrangler types
```

It includes OAuth callback URLs, R2 CORS, D1 IDs, queue/DLQ bindings, custom domain, production `APP_ORIGIN`, rollback, backups, monitoring, and `wrangler tail` checks. `.dev.vars.example` contains names only, never values.

- [ ] **Step 2: Add explicit approval gates**

Before any of these outward-facing actions, stop and ask the project owner:

```bash
npx wrangler d1 migrations apply codex-skin-store --remote
npm run deploy
```

Provisioning resources, setting secrets, remote migrations, DNS/custom-domain changes, Search Console submission, and production deployment each require explicit approval in that context.

- [ ] **Step 3: Rehearse locally**

Run `npm run preview` and the release smoke suite against the preview URL. Expected: both locales, auth test mode, seeded catalog, upload fixture, delivery, moderation, SEO XML, and health endpoint pass locally.

- [ ] **Step 4: Commit final plan checkpoint**

```bash
git add README.md docs/runbooks/deployment.md .dev.vars.example wrangler.json
git commit -m "docs: add Cloudflare release runbook"
git status --short
git log --oneline -10
```

Expected: clean worktree and ten milestone commits visible. Do not push or deploy unless explicitly requested and approved.
