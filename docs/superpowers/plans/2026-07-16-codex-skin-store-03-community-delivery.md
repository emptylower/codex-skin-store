# Delivery, Favorites, Comments, and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the consumer loop: intent-preserving OAuth, secure theme delivery, prompt copy, favorites, public comments, reporting, trend metrics, and account anonymization.

**Architecture:** Better Auth from Milestone 2 remains the identity source. Signed, single-use intent records bridge pre-auth actions to post-auth routes. Engagement services authorize against the current public/clean/ready theme state, stream private packages through a Worker route, and persist append-only events; comments and reports share moderation-ready status fields without exposing admin UI yet.

**Tech Stack:** Existing Milestones 1–2 stack, Better Auth 1.6.23, D1, private R2 `PACKAGES`, Turnstile-compatible rate-limit port, Vitest Workers pool, Playwright.

---

## Locked File Map

```text
migrations/0003_engagement_community.sql
app/db/schema/engagement.ts
app/db/schema/moderation.ts
app/domain/engagement/intent.ts
app/domain/engagement/trend.ts
app/domain/comments/policy.ts
app/services/identity/intents.server.ts
app/services/engagement/{favorites,delivery,events,counters}.server.ts
app/services/comments/comments.server.ts
app/services/moderation/reports.server.ts
app/platform/cloudflare/package-download.server.ts
app/platform/cloudflare/rate-limit.server.ts
app/routes/theme-download.ts
app/routes/theme-prompt.tsx
app/routes/favorite.ts
app/routes/me-favorites.tsx
app/routes/theme-comments.ts
app/routes/report.ts
app/routes/account-delete.tsx
app/components/{delivery-actions,favorite-button,comment-list,comment-form,report-dialog}.tsx
workers/app.ts
tests/{unit,integration,routes,e2e}/
```

### Task 1: Add engagement, comment, report, and intent schema

**Files:**
- Create: `migrations/0003_engagement_community.sql`, `app/db/schema/engagement.ts`, `app/db/schema/moderation.ts`, `tests/integration/engagement-migration.test.ts`

- [ ] **Step 1: Write the failing migration test**

Assert tables `auth_intents`, `favorites`, `comments`, `reports`, `moderation_actions`, and `engagement_events` exist. Assert unique `(user_id, theme_id)` favorites and one-time intent token hashes.

```ts
await expect(
  env.DB.batch([
    env.DB.prepare("INSERT INTO favorites(user_id,theme_id,created_at) VALUES(?,?,?)").bind("u1","t1",1),
    env.DB.prepare("INSERT INTO favorites(user_id,theme_id,created_at) VALUES(?,?,?)").bind("u1","t1",2),
  ]),
).rejects.toThrow();
```

Run `npm run test:workers -- tests/integration/engagement-migration.test.ts`. Expected: FAIL because migration 0003 is absent.

- [ ] **Step 2: Create the schema**

Use these contracts:

```sql
CREATE TABLE auth_intents (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK(action IN ('download','copy_prompt','favorite','comment','report')),
  theme_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE favorites (
  user_id TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, theme_id)
);
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  theme_id TEXT NOT NULL,
  user_id TEXT,
  author_label TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL CHECK(status IN ('visible','hidden_by_author','removed_by_admin','deleted_by_user')),
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT,
  target_type TEXT NOT NULL CHECK(target_type IN ('theme','comment','user')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL CHECK(status IN ('open','dismissed','resolved')),
  resolved_by TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('theme','comment','user','report','copyright_claim')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE engagement_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  theme_id TEXT NOT NULL,
  theme_version INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('download','prompt_copy','favorite_add','favorite_remove')),
  platform TEXT,
  created_at INTEGER NOT NULL
);
```

Add indexes for theme comments, open reports, intent expiry, and event time/theme/type.

- [ ] **Step 3: Apply and verify**

Run:

```bash
npm run db:migrate:local
npm run test:workers -- tests/integration/engagement-migration.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add migrations/0003_engagement_community.sql app/db/schema tests/integration/engagement-migration.test.ts
git commit -m "feat(engagement): add community schema"
```

### Task 2: Implement signed, expiring, single-use auth intents

**Files:**
- Create: `app/domain/engagement/intent.ts`, `app/services/identity/intents.server.ts`, `tests/unit/auth-intent.test.ts`, `tests/integration/auth-intent-store.test.ts`
- Modify: sign-in and OAuth completion routes from Milestone 2

- [ ] **Step 1: Write failing intent tests**

Cover allowed actions, 10-minute expiry, tampered tokens, wrong theme, replay, and unsafe return paths.

```ts
expect(validateReturnPath("/en/themes/neon-road")).toBe(true);
expect(validateReturnPath("https://evil.example/")).toBe(false);
expect(validateReturnPath("//evil.example/")).toBe(false);
```

Run the two intent tests. Expected: FAIL.

- [ ] **Step 2: Implement token design**

Generate 32 random bytes, send only base64url plaintext to the browser, and store `SHA-256(token)` in D1. Store the action/theme/payload server-side. `consumeIntent()` performs a conditional update:

```sql
UPDATE auth_intents
SET consumed_at = ?
WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
```

Proceed only when `meta.changes === 1`. Payload permits only `returnPath`, `platform`, and a draft comment/report body within the same Zod limits as final submission.

- [ ] **Step 3: Restore behavior by action**

After OAuth:

- `download`: redirect to the authorized download route; the browser may follow the file response.
- `copy_prompt`: redirect to the theme with `?resume=copy_prompt` and focus a confirmation button. Do not attempt clipboard write in a callback loader.
- `favorite`: execute idempotently then return to the theme.
- `comment`/`report`: return to a confirmation form prefilled from the server-side intent; require a fresh submit.

- [ ] **Step 4: Verify and commit**

Run `npm run test:unit -- tests/unit/auth-intent.test.ts && npm run test:workers -- tests/integration/auth-intent-store.test.ts`. Expected: PASS.

```bash
git add app/domain/engagement app/services/identity app/routes tests/unit/auth-intent.test.ts tests/integration/auth-intent-store.test.ts
git commit -m "feat(auth): preserve gated user intents"
```

### Task 3: Add authorized package download and prompt delivery

**Files:**
- Create: `app/services/engagement/delivery.server.ts`, `app/platform/cloudflare/package-download.server.ts`, `app/routes/theme-download.ts`, `app/routes/theme-prompt.tsx`, `app/components/delivery-actions.tsx`, `tests/integration/delivery.test.ts`, `tests/routes/delivery-routes.test.tsx`
- Modify: `app/routes/theme-detail.tsx`, `app/routes.ts`

- [ ] **Step 1: Write failing authorization tests**

Assert anonymous requests produce an intent/sign-in response; public-clean-ready current versions deliver; unlisted/removed/processing/stale versions return 404; users cannot select arbitrary R2 keys.

- [ ] **Step 2: Choose Worker-proxied download**

Use a Worker proxy rather than a presigned R2 URL. It provides immediate authorization, custom-domain URLs, clean `Content-Disposition`, ETag/304, and byte ranges. `PackageStore.openCurrent(themeId)` derives the key from D1, not request input, calls `PACKAGES.get(key, { onlyIf, range })`, then streams `object.body`.

Set:

```ts
headers.set("Content-Type", "application/zip");
headers.set("Content-Disposition", `attachment; filename="codex-theme-${safeSlug}.zip"`);
headers.set("ETag", object.httpEtag);
headers.set("X-Content-Type-Options", "nosniff");
headers.set("Cache-Control", "private, no-store");
```

Support `206`, `304`, `416`, and `HEAD` without buffering the archive.

- [ ] **Step 3: Gate exact prompt text**

`theme-prompt.tsx` returns the generated prompt only to a signed-in user after current-state authorization. The client copies only after an explicit button click and sends a success event after `navigator.clipboard.writeText()` resolves. A rejected clipboard promise shows selectable text and does not record `prompt_copy`.

- [ ] **Step 4: Verify and commit**

Run `npm run test:workers -- tests/integration/delivery.test.ts tests/routes/delivery-routes.test.tsx`. Expected: PASS, including a streamed response assertion.

```bash
git add app/services/engagement app/platform/cloudflare/package-download.server.ts app/routes app/components tests
git commit -m "feat(delivery): add secure package and prompt access"
```

### Task 4: Implement favorites and personal library

**Files:**
- Create: `app/services/engagement/favorites.server.ts`, `app/routes/favorite.ts`, `app/routes/me-favorites.tsx`, `app/components/favorite-button.tsx`, `tests/integration/favorites.test.ts`, `tests/e2e/favorites.spec.ts`
- Modify: theme card/detail, routes registry

- [ ] **Step 1: Write failing favorite tests**

Assert add/remove are idempotent, anonymous add creates an intent, hidden/removed themes cannot be newly favorited, and the library excludes removed themes while retaining the relation for possible restoration.

- [ ] **Step 2: Implement service and optimistic control**

Use `INSERT ... ON CONFLICT DO NOTHING` and conditional delete. Update `favorites_count` in the same D1 batch as the relation, bounded at zero. UI uses a stable icon button with accessible label and rolls back optimistic state on failure.

- [ ] **Step 3: Implement `/me/favorites`**

Require a session, return `noindex,nofollow`, and render localized cards ordered by most recently saved. Empty state links to the marketplace.

- [ ] **Step 4: Verify and commit**

Run unit/integration tests and `npx playwright test tests/e2e/favorites.spec.ts`. Expected: PASS.

```bash
git add app/services/engagement/favorites.server.ts app/routes app/components tests
git commit -m "feat(favorites): add personal theme library"
```

### Task 5: Add append-only delivery events, trend score, and reconciliation

**Files:**
- Create: `app/services/engagement/events.server.ts`, `app/domain/engagement/trend.ts`, `app/services/engagement/counters.server.ts`, `tests/unit/trend-score.test.ts`, `tests/integration/event-counters.test.ts`
- Modify: delivery/favorite services, `workers/app.ts`, marketplace sort service

- [ ] **Step 1: Write failing scoring and reconciliation tests**

Assert distinct user/theme deliveries count once per seven-day window for the north-star query; prompt-copy and download both count as delivery but do not double-count one pair. Assert caps prevent one user from inflating trends.

Use a deterministic score:

```ts
score = recentUniqueDeliveries * 5 + recentFavorites * 2 + Math.max(0, 14 - ageDays);
```

- [ ] **Step 2: Record only completed actions**

Write `download` after the R2 object is opened successfully, `prompt_copy` only after browser success callback, and favorite events after the relation changes. Event failure is logged with `ctx.waitUntil` and never blocks package bytes or a successful clipboard response.

- [ ] **Step 3: Add scheduled reconciliation**

The Worker's `scheduled()` delegates to `reconcileCounters(env, scheduledTime)`, recalculating aggregate download/favorite counters and trend materialization from accepted events/relations. It is idempotent and processes bounded pages.

- [ ] **Step 4: Verify and commit**

Run the two tests and a Queue/cron handler test. Expected: PASS.

```bash
git add app/domain/engagement app/services/engagement workers/app.ts tests
git commit -m "feat(metrics): add delivery events and trend ranking"
```

### Task 6: Add safe first-level comments

**Files:**
- Create: `app/domain/comments/policy.ts`, `app/services/comments/comments.server.ts`, `app/routes/theme-comments.ts`, `app/components/comment-list.tsx`, `app/components/comment-form.tsx`, `tests/unit/comment-policy.test.ts`, `tests/integration/comments.test.ts`, `tests/e2e/comments.spec.ts`
- Modify: theme detail route/service

- [ ] **Step 1: Write failing policy tests**

Plain text only, trim Unicode whitespace, reject empty, cap at 1,000 Unicode code points, escape on render, and do not auto-link URLs. Assert no `parent_id` or reply endpoint exists.

- [ ] **Step 2: Implement comment service**

Public theme detail loads visible comments newest first through the marketplace service. Posting requires session, public theme, and rate-limit approval. Deleting one's own comment nulls `body`, sets `deleted_by_user`, and keeps `author_label = 'Deleted user'` only after account deletion; ordinary self-deletion displays a localized deleted marker.

Theme authors may set a visible comment to `hidden_by_author`; they cannot set `removed_by_admin` or erase audit-relevant fields.

- [ ] **Step 3: Add SSR list and forms**

Visitors read comments. Signed-out form submission enters the intent flow; signed-in submission uses a standard action so the feature works without client JavaScript.

- [ ] **Step 4: Verify and commit**

Run comment tests and Playwright with JavaScript disabled. Expected: PASS.

```bash
git add app/domain/comments app/services/comments app/routes app/components tests
git commit -m "feat(comments): add theme discussions"
```

### Task 7: Add unified reports and abuse controls

**Files:**
- Create: `app/services/moderation/reports.server.ts`, `app/platform/cloudflare/rate-limit.server.ts`, `app/routes/report.ts`, `app/components/report-dialog.tsx`, `tests/unit/report-policy.test.ts`, `tests/integration/reports.test.ts`, `tests/e2e/reports.spec.ts`

- [ ] **Step 1: Write failing report tests**

Controlled reasons: `copyright`, `sexual_content`, `harassment`, `malware_or_unsafe`, `spam`, `other`. Validate target existence/type, 2,000-character details, dedupe same reporter/target/reason for 24 hours, and prove reports do not auto-hide content.

- [ ] **Step 2: Define rate-limit port**

```ts
export interface AbuseGate {
  check(input: { action: "comment" | "report"; userId: string; ipHash: string; turnstileToken?: string }): Promise<{ allowed: boolean; challengeRequired: boolean }>;
}
```

Local implementation uses a D1 window counter. Production adapter verifies Turnstile when `challengeRequired`; secrets remain bindings. Do not store raw IP, only an HMAC hash rotated by configured key version.

- [ ] **Step 3: Implement report action**

Require auth, validate input, pass abuse gate, insert `open` report, and return a confirmation. The author of reported content receives no reporter identity in public or creator views.

- [ ] **Step 4: Verify and commit**

Run report tests and Playwright. Expected: PASS.

```bash
git add app/services/moderation app/platform/cloudflare/rate-limit.server.ts app/routes app/components tests
git commit -m "feat(reports): add community abuse reporting"
```

### Task 8: Implement account deletion and anonymization

**Files:**
- Create: `app/services/identity/delete-account.server.ts`, `app/routes/account-delete.tsx`, `tests/integration/account-deletion.test.ts`, `tests/e2e/account-deletion.spec.ts`
- Modify: profile navigation

- [ ] **Step 1: Write failing deletion test**

Assert OAuth accounts/sessions and favorites are removed; comments lose `user_id` but retain body and `author_label = 'Deleted user'`; events lose `user_id`; owned themes become `unlisted`; aggregate/moderation records remain.

- [ ] **Step 2: Implement explicit destructive confirmation**

Require a fresh session check and typed confirmation phrase. Execute an atomic D1 batch for app-owned rows, then call Better Auth user/session cleanup. If auth cleanup fails, mark `users.deletion_status = 'auth_cleanup_pending'` and let the scheduled handler retry; do not pretend success is complete.

- [ ] **Step 3: Verify and commit**

Run integration and E2E tests. Expected: PASS with no personal user ID remaining in retained rows.

```bash
git add app/services/identity/delete-account.server.ts app/routes/account-delete.tsx tests
git commit -m "feat(identity): add account deletion and anonymization"
```

### Task 9: Complete the consumer/community checkpoint

**Files:**
- Create: `tests/e2e/delivery-auth-intent.spec.ts`, `tests/e2e/community-mobile.spec.ts`
- Modify: `README.md`, `app/styles/app.css`, relevant error boundaries

- [ ] **Step 1: Add end-to-end acceptance flows**

Cover anonymous download → OAuth test session → file; copy prompt → post-auth confirmation → clipboard success/fallback; favorite return; comment/report; removed theme denial; expired/replayed intent; 390×844 layout; keyboard-only dialog/form use.

- [ ] **Step 2: Verify error redaction and headers**

Responses never expose R2 keys, SQL text, OAuth tokens, raw IP, or stack traces. Download headers and range behavior are asserted.

- [ ] **Step 3: Run full checkpoint**

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Expected: all exit 0.

- [ ] **Step 4: Commit checkpoint**

```bash
git add README.md app tests/e2e
git commit -m "test: verify delivery and community checkpoint"
git status --short
```

Expected: clean worktree. Do not deploy yet.
