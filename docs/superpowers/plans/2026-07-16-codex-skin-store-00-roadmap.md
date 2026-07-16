# Codex Skin Store MVP Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this roadmap plan-by-plan. Each child plan contains checkbox (`- [ ]`) steps for tracking.

**Goal:** Deliver the approved Codex Skin Store MVP as four cumulative, independently deployable Cloudflare milestones.

**Architecture:** A React Router v7 SSR Worker serves the web app. D1 is authoritative for relational state, two private R2 buckets isolate source uploads from downloadable packages, Cloudflare Queues handles validation/package work, and Better Auth provides same-origin GitHub/Google OAuth. Domain policy and package contracts are pure TypeScript; route loaders/actions call services rather than bindings directly.

**Tech Stack:** React 19.2, React Router 7.18.1, TypeScript 7, Cloudflare Workers/Static Assets/D1/R2/Queues/Images, Better Auth 1.6.23, Drizzle ORM 0.45.2, Zod 4.4.3, Vitest 4.1, Cloudflare Workers Vitest pool 0.18.5, Playwright 1.61.

---

## Plan Order

1. [Public Marketplace and SEO Foundation](./2026-07-16-codex-skin-store-01-public-marketplace.md)
2. [Identity, Creator Upload, and Package Pipeline](./2026-07-16-codex-skin-store-02-creator-pipeline.md)
3. [Delivery, Favorites, Comments, and Reports](./2026-07-16-codex-skin-store-03-community-delivery.md)
4. [Moderation, Programmatic SEO, and Release Gate](./2026-07-16-codex-skin-store-04-release-gate.md)

Each plan starts from the committed checkpoint produced by the previous plan. Do not run plans in parallel.

## Locked Project Structure

```text
app/
├── components/                   # UI grouped by user-facing feature
├── db/
│   ├── client.server.ts          # request-scoped Drizzle factory
│   └── schema/                   # identity, catalog, engagement, moderation, SEO
├── domain/
│   ├── themes/                   # pure manifest/state/adapter/package policy
│   └── taxonomy/                 # controlled values and synonym normalization
├── i18n/                         # locale parsing and reviewed message catalogs
├── platform/
│   ├── ports.ts                  # infrastructure interfaces
│   └── cloudflare/               # D1, R2, Queue, Images, Turnstile adapters
├── routes/                       # React Router loaders/actions/components
├── services/                     # marketplace/themes/assets/identity/etc.
├── root.tsx
└── routes.ts
workers/app.ts                    # fetch, queue, scheduled handlers only
migrations/                       # ordered D1 SQL
scripts/                          # deterministic seed/package/SEO checks
tests/
├── unit/
├── integration/
├── routes/
├── packages/
├── seo/
├── e2e/
└── fixtures/media/
docs/superpowers/specs/           # approved design
docs/superpowers/plans/           # this roadmap and child plans
```

### Import boundary

- `app/domain/**` imports no Worker, React, D1, R2, or route modules.
- `app/services/**` may import domain modules and platform ports.
- `app/platform/cloudflare/**` implements ports and may import Cloudflare/Drizzle APIs.
- `app/routes/**` may import components, services, domain types, and i18n only.
- Route files must not import `cloudflare:workers`, D1 schema query code, or R2 adapters directly.
- `workers/app.ts` wires bindings and delegates; business rules do not live there.

Enforce this with ESLint `no-restricted-imports` in Plan 1.

## Cumulative Checkpoints

### Checkpoint 1: Public marketplace

A seeded bilingual marketplace is server-rendered, searchable, filterable, previewable, index-safe, and deployable. It contains no fake auth, upload, or community routes.

### Checkpoint 2: Creator pipeline

A user can sign in, create a private draft, upload one media asset to quarantine, process it idempotently through a Queue, preview generated adapters/package, publish atomically, version it, and unlist it.

### Checkpoint 3: Consumer/community loop

Download and prompt-copy intents survive OAuth; users can favorite, comment, report, and return to their library. Delivery events produce reconciled counters and trend order.

### Checkpoint 4: Release gate

Moderation, takedown handling, translation review, programmatic landing eligibility, complete structured SEO, analytics, accessibility, and the full P0 acceptance matrix are implemented.

## Approved Spec Coverage

| Approved spec section                 | Owning implementation plan                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1 Product definition and non-goals    | Roadmap scope; P0 routes in Plans 1-4; P1 remains excluded                                    |
| 2 Primary journeys                    | Discovery in Plan 1, creator in Plan 2, delivery/community in Plan 3, moderator in Plan 4     |
| 3 Information architecture            | Public routes Plan 1, authenticated routes Plans 2-3, administrative routes Plan 4            |
| 4 Cloudflare architecture             | Worker/D1 foundation Plan 1, Auth/R2/Queue/Images Plan 2, scheduled reconciliation Plan 3     |
| 5 Theme package contract              | Plan 2                                                                                        |
| 6 Data model and state/deletion       | Catalog Plan 1, identity/version/jobs Plan 2, engagement/deletion Plan 3, review/audit Plan 4 |
| 7 Comments, moderation, and licenses  | License declaration Plan 2, comments/reports Plan 3, admin/takedown Plan 4                    |
| 8 SEO and programmatic i18n           | Baseline SSR/canonical Plan 1, review/registry/full rollout Plan 4                            |
| 9 Ranking, search, and internal links | Search/links Plan 1, event-backed trend Plan 3                                                |
| 10 Error handling and safety          | Trust boundaries and negative tests across all four plans                                     |
| 11 Analytics and success              | Events/counters Plan 3, release metrics Plan 4                                                |
| 12 Release priorities                 | P0 across Plans 1-4; P1 excluded from schemas/routes                                          |
| 13 Testing and acceptance             | Incremental gates in each plan; full release matrix Plan 4                                    |
| 14 Product risks                      | Cross-plan gates below plus license/takedown/SEO gates in Plans 2 and 4                       |

## Cross-Plan Risk Gates

1. **React Router major version:** Pin `react-router` and `@react-router/dev` to `7.18.1`. Cloudflare's default C3 command now scaffolds v8, so start from the official starter architecture but install v7 explicitly.
2. **Auth runtime:** Construct Better Auth from request-scoped `context.cloudflare.env`. Keep `/api/auth/*` same-origin and preserve every `Set-Cookie` header in tests.
3. **Upload trust:** Direct uploads land only under server-generated quarantine keys. A completion endpoint heads and authorizes the object before queueing work.
4. **Media validation:** Trust magic bytes and decoded metadata, never filename or browser MIME. GIF support has a deployed-staging gate; malformed, oversized, and decompression-bomb fixtures must be rejected.
5. **R2/D1 consistency:** They are not transactional. Use deterministic keys, business idempotency keys, leases, artifact verification, conditional publication, and a scheduled requeue sweep.
6. **ZIP digest:** A ZIP cannot contain its own final digest. `payloadDigest` is computed over a canonical ordered inventory excluding `install-prompt.md`; the final ZIP gets a separate `archiveDigest` stored in D1/R2 metadata and shown beside the download.
7. **Clipboard:** OAuth callback cannot silently write to the clipboard because browsers require a fresh gesture. Restore a `copy_prompt` intent to a focused confirmation button, then record success after `navigator.clipboard.writeText()` resolves.
8. **Programmatic SEO:** Arbitrary filters never create canonical indexable pages. Only reviewed registry entries meeting inventory, creator diversity, translation, and unique-content gates enter sitemaps.

## Shared Verification Commands

Run at every checkpoint:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: all commands exit 0. At checkpoints with browser flows also run:

```bash
npm run test:e2e
```

Expected: Playwright exits 0 for Chromium desktop and mobile projects.

Before any remote migration or deployment:

```bash
npx wrangler whoami
npx wrangler d1 migrations list codex-skin-store --remote
npm run build
```

Remote migrations and deploys are outward-facing. Obtain explicit approval before running them.

## Definition of MVP Complete

All four child plans pass their release checks; both locales have complete reviewed content; theme adapters and archives validate; no user-controlled executable or install prompt enters a package; OAuth resumes intended actions; public HTML is useful without JavaScript; moderation and audit records work; only eligible SEO pages are canonical/indexable; desktop/mobile and keyboard/accessibility checks pass.
