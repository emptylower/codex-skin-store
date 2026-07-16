# Identity, Creator Upload, and Package Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Better Auth identity and a safe creator pipeline that converts one direct image upload into a validated, versioned, platform-specific package that can be atomically published and unlisted.

**Architecture:** Better Auth 1.6.23 is constructed per request over D1/Drizzle. Uploads go directly to a server-issued quarantine key in private `SOURCES`; explicit completion creates one leased `PACKAGE_QUEUE` job, and the worker writes immutable generated artifacts to private `PACKAGES`. Pure TypeScript owns media policy, neutral manifest v1, adapters, prompts, inventory digests, and lifecycle rules.

**Tech Stack:** React 19.2, React Router 7.18.1, TypeScript 7, Cloudflare Workers/D1/R2/Queues/Images, Better Auth 1.6.23, Drizzle ORM 0.45.2, Zod 4.4.3, aws4fetch 1.0.20, image-size 2.0.2, @cf-wasm/photon 0.3.7, client-zip 2.5.0, fflate 0.8.2, Vitest 4.1, Workers Vitest pool 0.18.5, Playwright 1.61.

---

## Locked Contracts

- Start from committed Milestone 1; retain its catalog tables, locale routing, service boundaries, and import lint rules.
- Bindings are exactly `DB`, `SOURCES`, `PACKAGES`, `PACKAGE_QUEUE`, and `IMAGES`; Queue consumer batch size is exactly 1.
- Visibility is `draft | public | unlisted | hidden`; moderation is `clean | flagged | removed`; package is `processing | ready | failed`.
- Version generation is `awaiting_upload | queued | processing | ready | failed`; job state is `queued | leased | succeeded | failed`.
- Source formats are PNG/JPEG/WebP. GIF is only Windows animated and remains disabled until Task 6's deployed staging gate passes.
- Limits are 25,000,000 source bytes, 16,000,000 prepared bytes, 250,000 preview bytes, 8,192 pixels per side, and 16,777,216 decoded pixels.
- Licenses are `CC0-1.0 | CC-BY-4.0 | PERSONAL-REDISTRIBUTION-1.0`; publishing requires `rightsDeclared: true`.
- Compatibility targets are stable adapter IDs `original-macos-v1` and `forge-windows-v1`; their validators additionally pin tested upstream commit hashes in code and package metadata.
- Final keys stay `themes/{theme-id}/versions/{version}/generated/...`; quarantine and ZIP staging keys are private and deleted after success/expiry.
- `payloadDigest` hashes a canonical path-sorted inventory excluding `install-prompt.md`; `archiveDigest` hashes final ZIP bytes and exists only in D1/R2 metadata.
- ZIP entries use Store only, forward-slash UTF-8 paths, and one persisted `generatedAt` timestamp.

Run all local commands from `/Users/mac/Desktop/codex-skin-store`. Obtain approval immediately before every remote command in Task 9.

## Locked File Map

```text
package.json, package-lock.json                    # exact dependencies/scripts
wrangler.json, worker-configuration.d.ts           # R2/Queue/Images/cron/env
migrations/0002_creator_pipeline.sql               # auth/profile/upload/version/job state
app/db/schema/{identity,creator-pipeline,index}.ts # Drizzle mappings
app/domain/assets/{media-types,media-policy}.ts    # hostile-media policy
app/domain/themes/{creator-input,state}.ts         # creator/state contracts
app/domain/themes/{manifest-v1,compatibility}.ts   # neutral contract/targets
app/domain/themes/adapters/{macos-v1,windows-v1}.ts# distinct runtime manifests
app/domain/themes/{install-prompt-v1,package-inventory}.ts # fixed text/digests
app/platform/ports.ts                              # infrastructure interfaces
app/platform/cloudflare/{r2-presign,r2-sources,r2-packages}.server.ts
app/platform/cloudflare/{images,photon,package-queue}.server.ts
app/platform/cloudflare/{zip-client,zip-fflate,zip}.server.ts
app/services/{identity,profiles,creator-themes,uploads}.server.ts
app/services/{package-jobs,package-builder}.server.ts
app/routes/api.auth.ts, app/routes/auth.sign-in.tsx, app/routes/me.profile.tsx
app/routes/upload.tsx, app/routes/themes.$slug.edit.tsx
app/routes/api.uploads.{presign,complete}.ts
app/routes/api.creator-artifacts.$themeId.$version.$artifact.ts
app/routes.ts, workers/app.ts
workers/spikes/pipeline.ts, wrangler.spike.jsonc
scripts/{check-package,run-staging-spike}.ts
.github/workflows/pipeline-spike.yml
tests/{unit,integration,packages,routes,e2e}/       # tests named in tasks below
```

### Task 1: Bindings, D1 State, Better Auth, and Profiles

**Files:**

- Modify: `package.json`, `package-lock.json`, `wrangler.json`, `worker-configuration.d.ts`, `app/routes.ts`
- Create: `migrations/0002_creator_pipeline.sql`
- Create: `app/db/schema/identity.ts`, `app/db/schema/creator-pipeline.ts`
- Create: `app/services/identity.server.ts`, `app/services/profiles.server.ts`
- Create: `app/routes/api.auth.ts`, `app/routes/auth.sign-in.tsx`, `app/routes/me.profile.tsx`
- Test: `tests/integration/auth-profile.test.ts`, `tests/routes/creator-auth.test.ts`

- [ ] **Step 1: Write the failing auth/profile test**

```ts
it("links verified matching OAuth identities to one profile", async () => {
  const auth = createAuth(env, "https://store.test");
  expect(auth.options.account?.accountLinking).toMatchObject({
    enabled: true,
    allowDifferentEmails: false,
    requireLocalEmailVerified: true,
  });
  expect(
    auth.options.account?.accountLinking?.trustedProviders,
  ).toBeUndefined();
  await updateProfile(env.DB, "user-1", {
    handle: " Neon_Rider ",
    displayName: "Neon Rider",
    bio: "Theme maker",
  });
  await expect(
    updateProfile(env.DB, "user-2", {
      handle: "neon rider",
      displayName: "Other",
      bio: "",
    }),
  ).rejects.toMatchObject({ code: "handle_taken" });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:workers -- tests/integration/auth-profile.test.ts tests/routes/creator-auth.test.ts`
Expected: FAIL with missing `createAuth` and `updateProfile` exports.

- [ ] **Step 3: Install dependencies and configure bindings**

Run:

```bash
npm install better-auth@1.6.23 @better-auth/drizzle-adapter@1.6.23 aws4fetch@1.0.20 image-size@2.0.2 @cf-wasm/photon@0.3.7 client-zip@2.5.0 fflate@0.8.2
npm install -D @better-auth/cli@1.4.21 drizzle-kit@0.31.10
```

Merge into `wrangler.json`:

```jsonc
{
  "r2_buckets": [
    {
      "binding": "SOURCES",
      "bucket_name": "codex-skin-store-sources",
      "preview_bucket_name": "codex-skin-store-sources-preview",
    },
    {
      "binding": "PACKAGES",
      "bucket_name": "codex-skin-store-packages",
      "preview_bucket_name": "codex-skin-store-packages-preview",
    },
  ],
  "queues": {
    "producers": [
      { "binding": "PACKAGE_QUEUE", "queue": "codex-skin-store-packages" },
    ],
    "consumers": [
      {
        "queue": "codex-skin-store-packages",
        "max_batch_size": 1,
        "max_batch_timeout": 1,
        "max_retries": 8,
        "retry_delay": 30,
        "dead_letter_queue": "codex-skin-store-packages-dlq",
      },
    ],
  },
  "images": { "binding": "IMAGES" },
  "triggers": { "crons": ["*/5 * * * *"] },
  "vars": { "ENABLE_GIF_UPLOADS": "false", "ZIP_WRITER": "fflate" },
}
```

Declare both buckets, Queue, Images, OAuth/R2 secrets, `APP_ORIGIN`, feature flags, and `PackageQueueMessage { jobId; idempotencyKey }` in `worker-configuration.d.ts`.

- [ ] **Step 4: Add the D1 migration**

```sql
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1));
ALTER TABLE users ADD COLUMN deletion_status TEXT NOT NULL DEFAULT 'active' CHECK(deletion_status IN ('active','auth_cleanup_pending','deleted'));
CREATE UNIQUE INDEX users_email_unique ON users(lower(email)) WHERE email IS NOT NULL;
CREATE TABLE accounts(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,provider_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,access_token TEXT,refresh_token TEXT,id_token TEXT,access_token_expires_at INTEGER,refresh_token_expires_at INTEGER,scope TEXT,password TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(provider_id,account_id));
CREATE TABLE sessions(id TEXT PRIMARY KEY,expires_at INTEGER NOT NULL,token TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,ip_address TEXT,user_agent TEXT,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE verifications(id TEXT PRIMARY KEY,identifier TEXT NOT NULL,value TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER,updated_at INTEGER);
ALTER TABLE theme_versions ADD COLUMN creator_input_json TEXT;
ALTER TABLE theme_versions ADD COLUMN generation_state TEXT NOT NULL DEFAULT 'ready' CHECK(generation_state IN ('awaiting_upload','queued','processing','ready','failed'));
ALTER TABLE theme_versions ADD COLUMN source_key TEXT;
ALTER TABLE theme_versions ADD COLUMN source_filename TEXT;
ALTER TABLE theme_versions ADD COLUMN source_mime TEXT;
ALTER TABLE theme_versions ADD COLUMN source_bytes INTEGER;
ALTER TABLE theme_versions ADD COLUMN source_width INTEGER;
ALTER TABLE theme_versions ADD COLUMN source_height INTEGER;
ALTER TABLE theme_versions ADD COLUMN source_sha256 TEXT;
ALTER TABLE theme_versions ADD COLUMN preview_key TEXT;
ALTER TABLE theme_versions ADD COLUMN preview_bytes INTEGER;
ALTER TABLE theme_versions ADD COLUMN preview_sha256 TEXT;
ALTER TABLE theme_versions ADD COLUMN manifest_key TEXT;
ALTER TABLE theme_versions ADD COLUMN macos_adapter_key TEXT;
ALTER TABLE theme_versions ADD COLUMN windows_adapter_key TEXT;
ALTER TABLE theme_versions ADD COLUMN install_key TEXT;
ALTER TABLE theme_versions ADD COLUMN prompt_key TEXT;
ALTER TABLE theme_versions ADD COLUMN archive_bytes INTEGER;
ALTER TABLE theme_versions ADD COLUMN generated_at INTEGER;
ALTER TABLE theme_versions ADD COLUMN generation_error_code TEXT;
ALTER TABLE theme_versions ADD COLUMN generation_error_detail TEXT;
CREATE TABLE source_uploads(id TEXT PRIMARY KEY,theme_id TEXT NOT NULL,version INTEGER NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,quarantine_key TEXT NOT NULL UNIQUE,declared_content_type TEXT NOT NULL,expected_bytes INTEGER NOT NULL CHECK(expected_bytes BETWEEN 1 AND 25000000),state TEXT NOT NULL CHECK(state IN ('issued','completed','rejected')),r2_etag TEXT,expires_at INTEGER NOT NULL,completed_at INTEGER,created_at INTEGER NOT NULL,UNIQUE(theme_id,version),FOREIGN KEY(theme_id,version) REFERENCES theme_versions(theme_id,version) ON DELETE CASCADE);
CREATE TABLE package_jobs(id TEXT PRIMARY KEY,idempotency_key TEXT NOT NULL UNIQUE,theme_id TEXT NOT NULL,version INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('queued','leased','succeeded','failed')),attempt INTEGER NOT NULL DEFAULT 0,max_attempts INTEGER NOT NULL DEFAULT 5,available_at INTEGER NOT NULL,lease_owner TEXT,lease_expires_at INTEGER,last_error_code TEXT,last_error_detail TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,finished_at INTEGER,FOREIGN KEY(theme_id,version) REFERENCES theme_versions(theme_id,version) ON DELETE CASCADE);
CREATE INDEX package_jobs_sweep_idx ON package_jobs(state,available_at,lease_expires_at);
```

Map every column with `sqliteTable`; Better Auth properties map `name -> display_name`, `image -> avatar_url`, and use plural table names.

- [ ] **Step 5: Implement request-scoped auth and profile policy**

```ts
export function createAuth(env: Env, origin: string) {
  return betterAuth({
    baseURL: origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    database: drizzleAdapter(drizzle(env.DB, { schema }), {
      provider: "sqlite",
      schema,
      usePlural: true,
    }),
    user: { modelName: "users" },
    account: {
      modelName: "accounts",
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
        requireLocalEmailVerified: true,
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        scope: ["user:email"],
      },
    },
  });
}
export async function requireUser(request: Request, env: Env) {
  const session = await createAuth(
    env,
    new URL(request.url).origin,
  ).api.getSession({ headers: request.headers });
  if (!session) throw new Response("Authentication required", { status: 401 });
  return session.user;
}
```

`api.auth.ts` is registered explicitly as `route("api/auth/*", "routes/api.auth.ts")` and returns `auth.handler(request)` directly from both loader and action so all `Set-Cookie` headers survive. `updateProfile` normalizes handles to lowercase ASCII hyphens, enforces 3-32 characters and unique ownership, and limits display name/bio to 80/280 characters. Register `/api/auth/*`, `/:locale/auth/sign-in`, and `/:locale/me/profile`; OAuth callbacks are `{APP_ORIGIN}/api/auth/callback/{google|github}`.

- [ ] **Step 6: Pass tests and commit**

Run: `npx wrangler d1 migrations apply codex-skin-store --local && npm run test:workers -- tests/integration/auth-profile.test.ts tests/routes/creator-auth.test.ts`
Expected: migration applies; both test files PASS, including Google/GitHub URLs and multiple `Set-Cookie` values.

```bash
git add package.json package-lock.json wrangler.json worker-configuration.d.ts migrations/0002_creator_pipeline.sql app/db app/services/identity.server.ts app/services/profiles.server.ts app/routes app/routes.ts tests/integration/auth-profile.test.ts tests/routes/creator-auth.test.ts
git commit -m "feat: add creator identity and profile state"
```

### Task 2: Draft Contract, Direct Quarantine Upload, and Explicit Complete

**Files:**

- Create: `app/domain/themes/creator-input.ts`, `app/domain/themes/state.ts`
- Create: `app/platform/ports.ts`, `app/platform/cloudflare/r2-presign.server.ts`, `app/platform/cloudflare/r2-sources.server.ts`, `app/platform/cloudflare/package-queue.server.ts`
- Create: `app/services/creator-themes.server.ts`, `app/services/uploads.server.ts`
- Create: `app/routes/upload.tsx`, `app/routes/api.uploads.presign.ts`, `app/routes/api.uploads.complete.ts`
- Test: `tests/unit/creator-input.test.ts`, `tests/integration/uploads.test.ts`

- [ ] **Step 1: Write failing draft/upload tests**

```ts
it("creates one private draft and queues completion once", async () => {
  const draft = await createDraft(deps, validCreatorInput);
  expect(draft).toMatchObject({
    version: 1,
    visibility: "draft",
    packageStatus: "processing",
  });
  const issued = await issueUpload(deps, {
    userId: "u1",
    themeId: draft.themeId,
    version: 1,
    contentType: "image/png",
    bytes: 1024,
  });
  expect(issued.key).toMatch(/^quarantine\/.+\/versions\/1\/[0-9a-f-]+$/);
  await completeUpload(deps, { userId: "u1", uploadId: issued.uploadId });
  await completeUpload(deps, { userId: "u1", uploadId: issued.uploadId });
  expect(deps.queue.send).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:unit -- tests/unit/creator-input.test.ts && npm run test:workers -- tests/integration/uploads.test.ts`
Expected: FAIL with missing draft/upload services.

- [ ] **Step 3: Define and enforce creator input**

```ts
export const creatorInputSchema = z
  .object({
    sourceLocale: z.enum(["en", "zh-hans"]),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().min(20).max(500),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(64),
    license: z.enum(["CC0-1.0", "CC-BY-4.0", "PERSONAL-REDISTRIBUTION-1.0"]),
    attribution: z.string().trim().max(200),
    sourceUrl: z.union([
      z.literal(""),
      z
        .string()
        .url()
        .refine((v) => /^https?:/.test(v)),
    ]),
    platforms: z
      .array(z.enum(["macos", "windows"]))
      .min(1)
      .max(2),
    appearance: z.enum(["light", "dark"]),
    mediaType: z.enum(["static", "animated"]),
    accent: hex,
    secondary: hex,
    highlight: hex,
    focalPoint: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    }),
    compatibilityTargets: z
      .array(z.enum([MACOS_TARGET, WINDOWS_TARGET]))
      .min(1)
      .max(2),
    rightsDeclared: z.literal(true),
  })
  .superRefine((v, ctx) => {
    if (
      v.mediaType === "animated" &&
      (v.platforms.length !== 1 || v.platforms[0] !== "windows")
    )
      ctx.addIssue({
        code: "custom",
        path: ["platforms"],
        message: "animated_requires_windows_only",
      });
    if (v.license === "CC-BY-4.0" && !v.attribution)
      ctx.addIssue({
        code: "custom",
        path: ["attribution"],
        message: "attribution_required",
      });
  });
```

`createDraft` uses one D1 batch to insert `themes` as `draft/clean/processing`, version 1 as `awaiting_upload`, and the approved source-locale translation. Reject restricted users and duplicate slugs.

- [ ] **Step 4: Implement exact-key presigning and completion**

```ts
const key = `quarantine/${themeId}/versions/${version}/${crypto.randomUUID()}`;
const url = new URL(
  `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/codex-skin-store-sources/${key.split("/").map(encodeURIComponent).join("/")}`,
);
url.searchParams.set("X-Amz-Expires", "600");
const headers = new Headers({
  "content-type": contentType,
  "x-amz-meta-upload-id": uploadId,
  "x-amz-meta-expected-bytes": String(bytes),
});
const signed = await new AwsClient({
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
}).sign(url, {
  method: "PUT",
  headers,
  aws: { signQuery: true, allHeaders: true },
});
```

Completion joins upload/theme/version by authenticated owner, requires `issued`, unexpired, draft, and `awaiting_upload`, then checks R2 HEAD key, exact size, max size, ETag, `upload-id`, and `expected-bytes`. On mismatch, mark rejected and delete quarantine. On success use `INSERT ... ON CONFLICT(idempotency_key) DO NOTHING` for `package:{themeId}:{version}`, set version `queued`, then send only when the insert changed one row.

- [ ] **Step 5: Add same-origin routes and direct browser PUT**

```ts
const presign = await postJson("/api/uploads/presign", {
  themeId,
  version,
  contentType: file.type,
  bytes: file.size,
});
const upload = await fetch(presign.url, {
  method: "PUT",
  headers: presign.headers,
  body: file,
});
if (!upload.ok) throw new Error("direct_upload_failed");
await postJson("/api/uploads/complete", { uploadId: presign.uploadId });
```

Both JSON actions require Better Auth and exact request `Origin`; never send cookies to R2. The presigned URL cannot enforce 25 MB, so completion must enforce actual `head.size`. Render structured fields only; accept no ZIP/JSON/Markdown/prompt input.

- [ ] **Step 6: Pass tests and commit**

Run: `npm run test:unit -- tests/unit/creator-input.test.ts && npm run test:workers -- tests/integration/uploads.test.ts`
Expected: PASS for authorization, mismatch deletion, and repeated completion.

```bash
git add app/domain/themes/creator-input.ts app/domain/themes/state.ts app/platform app/services/creator-themes.server.ts app/services/uploads.server.ts app/routes/upload.tsx app/routes/api.uploads.presign.ts app/routes/api.uploads.complete.ts app/routes.ts tests/unit/creator-input.test.ts tests/integration/uploads.test.ts
git commit -m "feat: add draft-bound direct uploads"
```

### Task 3: Safe Media Validation and Static Processing

**Files:**

- Create: `app/domain/assets/media-types.ts`, `app/domain/assets/media-policy.ts`
- Create: `app/platform/cloudflare/images.server.ts`, `app/platform/cloudflare/photon.server.ts`
- Create: `tests/helpers/media.ts`
- Test: `tests/unit/media-policy.test.ts`, `tests/packages/static-media.test.ts`

- [ ] **Step 1: Write failing hostile-media tests**

```ts
it.each([
  [png(1920, 1080), "image/png"],
  [jpeg(1920, 1080), "image/jpeg"],
  [webp(1920, 1080), "image/webp"],
])("accepts a valid static container", (bytes, mime) =>
  expect(inspectMedia(bytes, bytes.length)).toMatchObject({
    mime,
    width: 1920,
    height: 1080,
  }),
);
it.each([
  [svgBytes, "unsupported_signature"],
  [zipBytes, "unsupported_signature"],
  [png(8192, 8192), "decoded_pixel_limit"],
  [pngWithTrailingHtml, "container_trailing_bytes"],
])("rejects hostile bytes", (bytes, code) =>
  expect(() => inspectMedia(bytes, bytes.length)).toThrowError(
    expect.objectContaining({ code }),
  ),
);
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:unit -- tests/unit/media-policy.test.ts && npm run test:workers -- tests/packages/static-media.test.ts`
Expected: FAIL with missing `inspectMedia`.

- [ ] **Step 3: Implement magic/container/dimension policy**

```ts
export function inspectMedia(
  bytes: Uint8Array,
  objectBytes: number,
): MediaInspection {
  if (objectBytes < 1) throw new MediaError("source_empty");
  if (objectBytes > 25_000_000) throw new MediaError("source_too_large");
  const kind = detectExactMagic(bytes); // PNG 8-byte, JPEG FFD8FF, RIFF/WEBP, GIF87a/GIF89a
  if (!kind) throw new MediaError("unsupported_signature");
  const terminalOffset = walkContainer(bytes, kind); // IEND, EOI, RIFF length, GIF trailer
  if (terminalOffset !== objectBytes)
    throw new MediaError("container_trailing_bytes");
  const { width, height } = imageSize(bytes);
  if (!width || !height || width > 8192 || height > 8192)
    throw new MediaError("dimension_limit");
  if (width * height > 16_777_216) throw new MediaError("decoded_pixel_limit");
  const frames = kind === "gif" ? countGifFrames(bytes) : 1;
  if (frames > 300 || width * height * frames > 50_331_648)
    throw new MediaError("gif_frame_limit");
  return {
    mime: mimeFor(kind),
    extension: extensionFor(kind),
    width,
    height,
    frames,
    mediaType: frames > 1 ? "animated" : "static",
  };
}
```

`walkContainer` bounds every read and rejects malformed chunk/marker/sub-block lengths. Tests construct complete PNG/JPEG/WebP/GIF bytes, including PNG CRCs, rather than trusting filename/browser MIME.

- [ ] **Step 4: Decode and prepare PNG/JPEG/WebP**

```ts
const info = await env.IMAGES.info(new Response(prepared).body!);
if (
  info.format === "image/svg+xml" ||
  info.format !== expectedMime ||
  info.width !== width ||
  info.height !== height
)
  throw new MediaError("decode_failed");
for (const quality of [82, 74, 66, 58, 50]) {
  const output = await env.IMAGES.input(new Response(prepared).body!)
    .transform({
      width: 1600,
      height: 1000,
      fit: "cover",
      gravity: { x: focal.x, y: focal.y, mode: "box-center" },
    })
    .output({ format: "image/jpeg", quality, anim: false });
  const preview = new Uint8Array(
    await new Response(output.image()).arrayBuffer(),
  );
  if (preview.length <= 250_000) return { prepared, preview };
}
throw new MediaError("preview_too_large");
```

Images input is capped at 20 MB. For a validated 20-25 MB static source, or any source above the 16 MB prepared limit, decode with `PhotonImage.new_from_byteslice`, verify dimensions, encode WebP, call `.free()` in `finally`, enforce 16 MB, then validate the result with Images. Static processing must pass with both feature flags disabled.

- [ ] **Step 5: Pass tests and commit**

Run: `npm run test:unit -- tests/unit/media-policy.test.ts && npm run test:workers -- tests/packages/static-media.test.ts`
Expected: PASS for valid PNG/JPEG/WebP, spoofed MIME, trailing active bytes, malformed containers, and pixel bombs.

```bash
git add app/domain/assets app/platform/cloudflare/images.server.ts app/platform/cloudflare/photon.server.ts tests/helpers/media.ts tests/unit/media-policy.test.ts tests/packages/static-media.test.ts
git commit -m "feat: validate and prepare static media"
```

### Task 4: Queue Leasing, Idempotency, Retry, and Sweeper

**Files:**

- Create: `app/services/package-jobs.server.ts`
- Modify: `workers/app.ts`
- Test: `tests/integration/package-jobs.test.ts`

- [ ] **Step 1: Write failing lease/retry/sweep tests**

```ts
it("leases one job, ignores a duplicate delivery, and sweeps expiry", async () => {
  const first = await leaseJob(db, "job-1", "worker-a", now);
  expect(first).toMatchObject({ state: "leased", attempt: 1 });
  expect(await leaseJob(db, "job-1", "worker-b", now)).toBeNull();
  await sweepExpiredJobs(deps, new Date(now.getTime() + 301_000));
  expect(await jobState(db, "job-1")).toBe("queued");
  expect(deps.queue.send).toHaveBeenCalledWith({
    jobId: "job-1",
    idempotencyKey: "package:t1:1",
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:workers -- tests/integration/package-jobs.test.ts`
Expected: FAIL with missing job service.

- [ ] **Step 3: Implement conditional five-minute leases**

```ts
export async function leaseJob(
  db: D1Database,
  jobId: string,
  owner: string,
  now = new Date(),
) {
  const result = await db
    .prepare(
      "UPDATE package_jobs SET state='leased',attempt=attempt+1,lease_owner=?,lease_expires_at=?,updated_at=? WHERE id=? AND state='queued' AND available_at<=? AND attempt<max_attempts",
    )
    .bind(owner, now.getTime() + 300_000, now.getTime(), jobId, now.getTime())
    .run();
  return result.meta.changes === 1
    ? db
        .prepare("SELECT * FROM package_jobs WHERE id=?")
        .bind(jobId)
        .first<JobRow>()
    : null;
}
```

`finishJob` conditionally changes the owned lease to `succeeded`. `failJob` stores stable code plus a scrubbed 500-character detail; retryable failures use delays `[30,120,600,1800]`, clear lease, set `queued`, and send after D1 succeeds. Permanent failures or exhausted attempts set job/version/theme to `failed` while visibility remains private.

- [ ] **Step 4: Delegate queue and scheduled handlers**

```ts
async queue(batch: MessageBatch<PackageQueueMessage>, env: Env) {
  const message = batch.messages[0];
  const outcome = await consumePackageMessage(env, message.body);
  if (outcome.kind === "retry") message.retry({ delaySeconds: outcome.delaySeconds }); else message.ack();
},
async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  ctx.waitUntil(sweepExpiredJobs(createJobDeps(env), new Date()));
}
```

The sweeper requeues expired leases, queues due rows whose message may have been lost, marks exhausted rows failed, deletes expired quarantine objects, and deletes `staging/zips/*` older than one hour. Business logic remains in services.

- [ ] **Step 5: Pass tests and commit**

Run: `npm run test:workers -- tests/integration/package-jobs.test.ts`
Expected: PASS for duplicate messages, lease ownership, transient retry, permanent failure, exhausted retry, and sweeper recovery.

```bash
git add app/services/package-jobs.server.ts workers/app.ts tests/integration/package-jobs.test.ts
git commit -m "feat: lease and recover package jobs"
```

### Task 5: Neutral Manifest v1, Runtime Adapters, and Fixed Install Text

**Files:**

- Create: `app/domain/themes/compatibility.ts`, `app/domain/themes/manifest-v1.ts`
- Create: `app/domain/themes/adapters/macos-v1.ts`, `app/domain/themes/adapters/windows-v1.ts`
- Create: `app/domain/themes/install-prompt-v1.ts`
- Test: `tests/unit/manifest-v1.test.ts`, `tests/unit/adapters.test.ts`, `tests/unit/install-prompt.test.ts`

- [ ] **Step 1: Write failing contract snapshots**

```ts
expect(buildManifest(fixture)).toMatchObject({
  schemaVersion: 1,
  id: "theme-1",
  slug: "neon-road",
  version: 1,
  platforms: ["macos", "windows"],
});
expect(buildMacosAdapter(fixture)).toHaveProperty("colors.panelAlt");
expect(buildWindowsAdapter(fixture)).toHaveProperty("layout.previewPosition");
expect(buildMacosAdapter(fixture)).not.toHaveProperty("layout");
expect(renderInstallPrompt(fixture)).toContain(
  "Do not modify app.asar, WindowsApps, application signatures, API keys, Base URLs, or model providers.",
);
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:unit -- tests/unit/manifest-v1.test.ts tests/unit/adapters.test.ts tests/unit/install-prompt.test.ts`
Expected: FAIL with missing builders.

- [ ] **Step 3: Implement neutral manifest v1**

```ts
export const manifestV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
  slug: z.string(),
  version: z.number().int().positive(),
  localized: z.object({
    sourceLocale: z.enum(["en", "zh-hans"]),
    name: z.string(),
    description: z.string(),
  }),
  creator: z.object({ id: z.string(), handle: z.string() }),
  license: z.object({
    id: z.enum(["CC0-1.0", "CC-BY-4.0", "PERSONAL-REDISTRIBUTION-1.0"]),
    attribution: z.string(),
    sourceUrl: z.string(),
  }),
  platforms: z.array(z.enum(["macos", "windows"])),
  compatibilityTargets: z.array(z.enum([MACOS_TARGET, WINDOWS_TARGET])),
  appearance: z.enum(["light", "dark"]),
  mediaType: z.enum(["static", "animated"]),
  colors: z.object({
    accent: z.string(),
    secondary: z.string(),
    highlight: z.string(),
  }),
  focalPoint: z.object({ x: z.number(), y: z.number() }),
  assets: z.object({ background: assetSchema, preview: assetSchema }),
  generatedAt: z.string().datetime(),
});
```

`assetSchema` contains filename, MIME, byte size, width, height, and lowercase SHA-256. Serialize recursively sorted keys plus final newline.

- [ ] **Step 4: Implement distinct pinned adapters**

```ts
export function buildMacosAdapter(v: AdapterInput) {
  return {
    schemaVersion: 1,
    id: v.slug,
    name: v.name,
    brandSubtitle: v.name.toUpperCase(),
    tagline: v.description,
    projectPrefix: "Select project · ",
    projectLabel: "Select project",
    statusText: "THEME ONLINE",
    quote: v.name,
    image: v.backgroundFilename,
    colors: {
      background: v.canvas,
      panel: v.surface,
      panelAlt: v.surfaceAlt,
      accent: v.accent,
      accentAlt: v.highlight,
      secondary: v.secondary,
      highlight: v.accentStrong,
      text: v.text,
      muted: v.muted,
      line: v.line,
    },
  };
}
export function buildWindowsAdapter(v: AdapterInput) {
  return {
    schemaVersion: 1,
    id: v.slug,
    name: v.name,
    description: v.description,
    image: v.backgroundFilename,
    preview: "preview.jpg",
    mode: v.appearance,
    order: 0,
    brand: v.name.toUpperCase(),
    palette: {
      accent: v.accent,
      accentStrong: v.accentStrong,
      accentSoft: v.accentSoft,
      accentFaint: v.accentFaint,
      accentRgb: v.accentRgb,
      highlight: v.highlight,
      secondary: v.secondary,
      ink: v.text,
      inkRgb: v.textRgb,
      muted: v.muted,
      canvas: v.canvas,
      sidebar: v.sidebar,
      surface: v.surface,
      surfaceSolid: v.surfaceSolid,
      elevated: v.elevated,
      control: v.control,
      mainSurface: v.mainSurface,
      line: v.line,
      heavyLine: v.heavyLine,
      grid: v.grid,
      shadowRgb: "0, 0, 0",
      codeBackground: v.codeBackground,
      buttonText: v.buttonText,
    },
    layout: {
      copyAlign: "left",
      copyWidth: "46%",
      heroPosition: v.backgroundPosition,
      pagePosition: v.backgroundPosition,
      previewPosition: v.backgroundPosition,
      bodyBackground: v.canvas,
      heroOverlay: v.heroOverlay,
      pageOverlay: v.pageOverlay,
      homeOverlay: v.homeOverlay,
      titleColor: v.text,
      titleShadow: v.titleShadow,
    },
  };
}
```

Validate macOS against pinned original/Forge macOS rules and Windows against the pinned Forge validator. Never copy one shape to the other. Emit only selected platforms; GIF can never emit macOS.

- [ ] **Step 5: Render immutable prompt v1 and INSTALL**

The fixed prompt includes theme ID/version, selected platform, compatibility target, `payloadDigest`, and per-file hashes. Its ordered instructions detect OS, require official Codex plus target runtime, stop on missing prerequisites, back up state, verify hashes, copy only the detected adapter/assets, run the supported Dream Skin command, verify, and report exact failures. It contains the explicit prohibition in Step 1's assertion. `INSTALL.md` is human-readable but generated from the same platform matrix; creator text never enters either instruction file except escaped name/attribution fields.

- [ ] **Step 6: Pass tests and commit**

Run: `npm run test:unit -- tests/unit/manifest-v1.test.ts tests/unit/adapters.test.ts tests/unit/install-prompt.test.ts`
Expected: PASS for macOS-only, Windows-only, dual static, and Windows animated snapshots.

```bash
git add app/domain/themes/compatibility.ts app/domain/themes/manifest-v1.ts app/domain/themes/adapters app/domain/themes/install-prompt-v1.ts tests/unit/manifest-v1.test.ts tests/unit/adapters.test.ts tests/unit/install-prompt.test.ts
git commit -m "feat: generate neutral and runtime manifests"
```

### Task 6: Canonical Digests, Store-Only ZIP, and Compatibility Spike

**Files:**

- Create: `app/domain/themes/package-inventory.ts`
- Create: `app/platform/cloudflare/zip-client.server.ts`, `app/platform/cloudflare/zip-fflate.server.ts`, `app/platform/cloudflare/zip.server.ts`
- Create: `workers/spikes/pipeline.ts`, `wrangler.spike.jsonc`, `scripts/run-staging-spike.ts`
- Create: `.github/workflows/pipeline-spike.yml`
- Test: `tests/unit/package-inventory.test.ts`, `tests/packages/zip-writers.test.ts`

- [ ] **Step 1: Write failing digest/ZIP tests**

```ts
it("excludes prompt from payload digest and stores every entry", async () => {
  const inventory = await canonicalInventory(entries);
  expect(inventory.map((x) => x.path)).not.toContain("install-prompt.md");
  const bytes = await streamBytes(writer.stream(entries));
  const zip = await openZip(bytes);
  expect(zip.entries.every((e) => e.compressionMethod === 0)).toBe(true);
  expect(zip.entries.map((e) => e.name)).toEqual(expectedPaths.sort());
  expect(sha256(bytes)).not.toBe(payloadDigest(inventory));
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:unit -- tests/unit/package-inventory.test.ts tests/packages/zip-writers.test.ts`
Expected: FAIL with missing inventory/writers.

- [ ] **Step 3: Implement canonical payload digest**

```ts
export async function canonicalInventory(entries: Artifact[]) {
  return Promise.all(
    entries
      .filter((e) => e.path !== "install-prompt.md")
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(async (e) => ({
        path: e.path,
        size: e.size,
        sha256: await sha256(e.bytes),
      })),
  );
}
export async function payloadDigest(entries: Artifact[]) {
  const inventory = await canonicalInventory(entries);
  return sha256(
    new TextEncoder().encode(
      inventory.map((e) => `${e.path}\t${e.size}\t${e.sha256}\n`).join(""),
    ),
  );
}
```

Build inventory before the prompt, render prompt with that digest, then ZIP all entries. Stream final ZIP through Cloudflare `crypto.DigestStream("SHA-256")`; store resulting `archiveDigest` only after the stream finishes.

- [ ] **Step 4: Implement two Store-only writers**

```ts
export const clientZipWriter: StoreZipWriter = {
  implementation: "client-zip",
  stream: (entries) =>
    makeZip(
      (async function* () {
        for await (const e of entries)
          yield {
            name: e.name,
            size: e.size,
            lastModified: e.lastModified,
            input: toStream(e.body),
          };
      })(),
    ),
};
export const fflateWriter: StoreZipWriter = {
  implementation: "fflate",
  stream: (entries) =>
    new ReadableStream({
      start(controller) {
        const zip = new Zip((error, chunk, final) => {
          if (error) controller.error(error);
          else {
            controller.enqueue(chunk);
            if (final) controller.close();
          }
        });
        void pumpStoreEntries(zip, entries);
      },
    }),
};
```

`pumpStoreEntries` creates `ZipPassThrough` per entry, sets one UTC timestamp, reads with backpressure, pushes chunks, and calls `zip.end()`. Reject backslashes, absolute paths, `..`, duplicate names, and entries outside the approved layout.

- [ ] **Step 5: Run the deployed staging spike gate**

The isolated spike generates a static archive with each writer, transforms an animated GIF with `anim:false` for preview while preserving original GIF background, and returns hashes/archives. The workflow extracts both archives on `macos-15` and `windows-2025`, runs `scripts/check-package.ts`, and compares exact paths/bytes/timestamps.

Run after approval:

```bash
npx wrangler deploy --config wrangler.spike.jsonc --env staging
gh workflow run pipeline-spike.yml -f spike_url=https://codex-skin-store-pipeline-spike-staging.workers.dev
```

Expected gate: both OS jobs PASS; client-zip archive is byte-stable and valid; GIF metadata, still preview, original animation bytes, and Forge validator all PASS.

Decision is mechanical:

- Full pass: set staging/production `ZIP_WRITER=client-zip`, `ENABLE_GIF_UPLOADS=true`, and enable GIF in upload `accept` only when Windows is selected.
- Any client-zip failure: keep `ZIP_WRITER=fflate`; static support proceeds.
- Any GIF failure: keep `ENABLE_GIF_UPLOADS=false`; PNG/JPEG/WebP support proceeds.

- [ ] **Step 6: Pass local tests and commit**

Run: `npm run test:unit -- tests/unit/package-inventory.test.ts tests/packages/zip-writers.test.ts`
Expected: both writers PASS Store-only/path/digest tests; flags remain conservative until deployed evidence exists.

```bash
git add app/domain/themes/package-inventory.ts app/platform/cloudflare/zip-client.server.ts app/platform/cloudflare/zip-fflate.server.ts app/platform/cloudflare/zip.server.ts workers/spikes/pipeline.ts wrangler.spike.jsonc scripts/run-staging-spike.ts .github/workflows/pipeline-spike.yml tests/unit/package-inventory.test.ts tests/packages/zip-writers.test.ts
git commit -m "feat: stream deterministic store-only packages"
```

### Task 7: Idempotent Package Builder and R2 Promotion

**Files:**

- Create: `app/platform/cloudflare/r2-packages.server.ts`
- Create: `app/services/package-builder.server.ts`
- Create: `scripts/check-package.ts`
- Test: `tests/packages/static-pipeline.test.ts`

- [ ] **Step 1: Write the failing static end-to-end package test**

```ts
it.each(["png", "jpg", "webp"])(
  "builds a verified %s package",
  async (extension) => {
    const result = await buildPackageVersion(deps, fixtureVersion(extension));
    expect(result).toMatchObject({
      generationState: "ready",
      packageKey: "themes/theme-1/versions/1/generated/theme.zip",
    });
    await expect(
      checkStoredPackage(deps.packages, result.packageKey),
    ).resolves.toMatchObject({
      payloadDigest: result.payloadDigest,
      archiveDigest: result.archiveDigest,
    });
  },
);
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:workers -- tests/packages/static-pipeline.test.ts`
Expected: FAIL with missing package builder.

- [ ] **Step 3: Implement immutable artifact storage and verification**

For version base `themes/{id}/versions/{version}`, source final key is `source/background.{ext}` in `SOURCES`; generated keys in `PACKAGES` are `preview.jpg`, `manifest.json`, selected `adapters/{platform}/theme.json`, `install-prompt.md`, `INSTALL.md`, and `theme.zip`.

```ts
await bucket.put(key, body, {
  httpMetadata: {
    contentType,
    contentDisposition: "attachment",
    cacheControl: "private, no-store",
  },
  customMetadata: { sha256 },
  sha256,
});
const verified = await bucket.head(key);
if (
  !verified ||
  verified.size !== size ||
  verified.customMetadata.sha256 !== sha256
)
  throw new PackageError("artifact_verification_failed", true);
```

ZIP writes to `staging/zips/{jobId}.zip`, computes archive digest, HEAD-verifies, then copies to final immutable key with `archive-digest` and `payload-digest` metadata and deletes staging. A retry first verifies existing artifacts and skips exact matches; any mismatch is a permanent collision error.

- [ ] **Step 4: Orchestrate the complete builder**

```ts
export async function buildPackageVersion(deps: BuilderDeps, job: LeasedJob) {
  const row = await loadOwnedVersion(deps.db, job.themeId, job.version);
  if (row.generation_state === "ready") return verifyReadyArtifacts(deps, row);
  const bytes = await readBoundedSource(
    deps.sources,
    row.quarantine_key,
    25_000_000,
  );
  const inspected = inspectMedia(bytes, bytes.length);
  enforceDeclaredMedia(
    inspected,
    JSON.parse(row.creator_input_json),
    deps.enableGif,
  );
  const media =
    inspected.mediaType === "static"
      ? await prepareStaticMedia(deps, bytes, inspected)
      : await prepareGifMedia(deps, bytes, inspected);
  const sourceSha = await sha256(media.background.bytes),
    generatedAt = new Date(row.created_at).toISOString();
  await deps.sources.moveQuarantineToSource({
    quarantineKey: row.quarantine_key,
    sourceKey: sourceKey(row, media.background.extension),
    sha256: sourceSha,
    contentType: media.background.mime,
  });
  const artifacts = await renderArtifacts(row, media, generatedAt);
  const digest = await payloadDigest(artifacts);
  artifacts.push(renderPromptArtifact(row, artifacts, digest));
  return writeVerifyZipAndMarkReady(deps, row, artifacts, digest, generatedAt);
}
```

`writeVerifyZipAndMarkReady` verifies every object before a conditional update sets version ready plus all keys/hashes/sizes and sets theme package status ready only when `themes.current_version=version`. No partial version becomes ready.

- [ ] **Step 5: Add the package checker, pass tests, and commit**

`check-package.ts` rejects unexpected/duplicate paths, non-Store entries, schema/adapters that fail Zod, missing selected adapters, extra unselected adapters, wrong file hashes, wrong payload digest, unsafe prompt text, and archive digest mismatch supplied beside the archive.

Run: `npm run test:workers -- tests/packages/static-pipeline.test.ts && npm run check:package -- tests/fixtures/packages/dual-static.zip tests/fixtures/packages/dual-static.expected.json`
Expected: three static pipeline cases PASS and checker prints `package valid`.

```bash
git add app/platform/cloudflare/r2-packages.server.ts app/services/package-builder.server.ts scripts/check-package.ts tests/packages/static-pipeline.test.ts tests/fixtures/packages
git commit -m "feat: build and verify theme packages"
```

### Task 8: Version, Preview, Atomic Publish, and Unlist Lifecycle

**Files:**

- Modify: `app/services/creator-themes.server.ts`
- Create: `app/routes/themes.$slug.edit.tsx`
- Create: `app/routes/api.creator-artifacts.$themeId.$version.$artifact.ts`
- Modify: `app/routes.ts`
- Test: `tests/integration/publication.test.ts`, `tests/routes/creator-lifecycle.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it("versions, publishes ready current version, and unlists without deleting history", async () => {
  await expect(
    publishTheme(deps, { userId: "u1", themeId: "t1", version: 1 }),
  ).rejects.toMatchObject({ code: "version_not_ready" });
  await markFixtureReady(db, "t1", 1);
  await publishTheme(deps, { userId: "u1", themeId: "t1", version: 1 });
  expect(await state(db, "t1")).toMatchObject({
    visibility: "public",
    package_status: "ready",
    current_version: 1,
  });
  const v2 = await createVersion(deps, {
    userId: "u1",
    themeId: "t1",
    input: changedMetadata,
  });
  expect(v2.version).toBe(2);
  expect(await state(db, "t1")).toMatchObject({
    visibility: "public",
    current_version: 1,
  });
  await unlistTheme(deps, { userId: "u1", themeId: "t1" });
  expect((await state(db, "t1")).visibility).toBe("unlisted");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:workers -- tests/integration/publication.test.ts tests/routes/creator-lifecycle.test.ts`
Expected: FAIL with missing lifecycle operations.

- [ ] **Step 3: Implement metadata edits and new versions**

Draft metadata can change before publication, including slug while collision-checked. After first publication slug is immutable. A new version copies the last creator input, validates edits, inserts version `max(version)+1/awaiting_upload`, leaves the public current version downloadable, and starts the same upload pipeline. Publishing v2 switches current version only after v2 is ready.

- [ ] **Step 4: Implement guarded atomic publication**

```sql
UPDATE themes
SET visibility='public',current_version=?,package_status='ready',updated_at=?
WHERE id=? AND author_id=? AND moderation_status!='removed'
  AND EXISTS(SELECT 1 FROM theme_versions v WHERE v.theme_id=themes.id AND v.version=? AND v.generation_state='ready' AND v.package_key IS NOT NULL AND v.archive_digest IS NOT NULL);
UPDATE theme_versions
SET published_at=COALESCE(published_at,?),updated_at=?
WHERE theme_id=? AND version=? AND generation_state='ready' AND package_key IS NOT NULL AND archive_digest IS NOT NULL;
```

Execute both statements in `DB.batch`, then require the first result's `meta.changes === 1`; otherwise return `version_not_ready`. Because the second statement repeats the same readiness predicates and the batch is atomic, no compensating write is needed. Before running the batch, HEAD-verify final package metadata. Unlist is owner-only `public|unlisted -> unlisted`, preserves versions/events/moderation records, and does not alter package readiness. Hidden/removed state cannot be bypassed.

- [ ] **Step 5: Add creator edit/preview routes**

The edit route displays generation state/error, source preview, selected platforms, manifest/adapters/INSTALL names, package size, payload/archive digests, version history, retry upload for failed versions, create-version, publish, and unlist actions. The artifact route requires the author, allowlists `preview|manifest|macos-adapter|windows-adapter|install|prompt`, reads the recorded key only, and returns `private, no-store`, correct content type, attachment for JSON/Markdown, and `X-Content-Type-Options: nosniff`.

- [ ] **Step 6: Pass tests and commit**

Run: `npm run test:workers -- tests/integration/publication.test.ts tests/routes/creator-lifecycle.test.ts`
Expected: PASS for wrong owner, not-ready, stale version, package HEAD mismatch, first publish, v2 switch, immutable slug, unlist, and removed theme.

```bash
git add app/services/creator-themes.server.ts app/routes/themes.\$slug.edit.tsx app/routes/api.creator-artifacts.\$themeId.\$version.\$artifact.ts app/routes.ts tests/integration/publication.test.ts tests/routes/creator-lifecycle.test.ts
git commit -m "feat: publish and version creator themes"
```

### Task 9: Staging Resources and Milestone Verification

**Files:**

- Modify: `app/routes/upload.tsx`, `workers/app.ts`, `wrangler.json`
- Create: `tests/e2e/creator-pipeline.spec.ts`
- Modify: deployment environment configuration outside Git via Wrangler secrets/vars

- [ ] **Step 1: Write the failing creator browser test**

```ts
test("creator uploads static theme, waits for processing, publishes, versions, and unlists", async ({
  page,
}) => {
  await signInFixtureUser(page);
  await page.goto("/en/upload");
  await fillCreatorForm(page, {
    platforms: ["macos", "windows"],
    file: "tests/fixtures/media/neon-road.png",
  });
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Package ready")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Public")).toBeVisible();
  await page.getByRole("button", { name: "Create new version" }).click();
  await expect(page.getByText("Version 2")).toBeVisible();
  await page.getByRole("button", { name: "Unlist" }).click();
  await expect(page.getByText("Unlisted")).toBeVisible();
});
```

- [ ] **Step 2: Verify the E2E test fails before resource setup**

Run: `npm run test:e2e -- tests/e2e/creator-pipeline.spec.ts`
Expected: FAIL because local Queue/fixture OAuth wiring is not active.

- [ ] **Step 3: Complete local wiring and static acceptance first**

Ensure `workers/app.ts` delegates fetch/queue/scheduled, upload UI exposes GIF only when the flag is true and Windows-only, Queue batch remains 1, and local test bindings use separate `SOURCES`/`PACKAGES`. Run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:packages
npm run build
npm run test:e2e -- tests/e2e/creator-pipeline.spec.ts
```

Expected: all exit 0 with PNG/JPEG/WebP paths while `ENABLE_GIF_UPLOADS=false` and `ZIP_WRITER=fflate`.

- [ ] **Step 4: Provision approved staging resources and CORS**

After explicit approval, run:

```bash
npx wrangler whoami
npx wrangler queues create codex-skin-store-packages
npx wrangler queues create codex-skin-store-packages-dlq
npx wrangler r2 bucket create codex-skin-store-sources
npx wrangler r2 bucket create codex-skin-store-packages
npx wrangler r2 bucket cors set codex-skin-store-sources --file config/r2-sources-cors.staging.json
npx wrangler d1 migrations apply codex-skin-store --remote
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler deploy --env staging
```

The CORS rule permits only the staging/production app origins, method `PUT`, headers `Content-Type`, `x-amz-meta-upload-id`, `x-amz-meta-expected-bytes`, exposes `ETag`, and uses 600-second max age. Set public client IDs/account ID with environment vars; never commit secrets.

- [ ] **Step 5: Apply the spike decision and verify staging**

Run the Task 6 spike workflow. Apply only its mechanical flag results, redeploy staging, upload one PNG, JPEG, and WebP, publish each platform combination, download artifacts through the author-only preview route, run `check:package`, force one transient Queue retry, expire one lease, run the sweeper, create v2, publish v2, and unlist.

Expected: static cases always pass; Queue produces no duplicate version/artifacts; failed processing stays private/retryable; public state requires ready package; archive metadata matches checker. GIF is claimed only if its gate passed; client-zip is selected only if both OS jobs passed.

- [ ] **Step 6: Final verification and commit**

Run:

```bash
npm run format:check && npm run lint && npm run typecheck && npm run test && npm run test:packages && npm run build && npm run test:e2e
```

Expected: every command exits 0; Playwright passes desktop/mobile; generated packages contain no executable, user-authored prompt, nested archive, active markup, or adapter for an unselected platform.

```bash
git add app/routes/upload.tsx workers/app.ts wrangler.json tests/e2e/creator-pipeline.spec.ts
git commit -m "test: verify creator pipeline milestone"
```
