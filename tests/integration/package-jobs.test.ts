import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumePackageMessage,
  failJob,
  finishJob,
  LEASE_MS,
  leaseJob,
  RETRY_DELAYS_SECONDS,
  sweepExpiredJobs,
  type PackageJobDeps,
  type PackageJobRow,
} from "~/services/package-jobs.server";

const NOW = 1_700_500_000_000;
const THEME_ID = "t1";
const JOB_ID = "job-1";
const IDEMPOTENCY_KEY = "package:t1:1";

async function insertUser(id = "u-job") {
  await env.DB.prepare(
    `INSERT INTO users (
       id, handle, display_name, bio, role, upload_status,
       email_verified, deletion_status, created_at, updated_at
     ) VALUES (?, ?, ?, '', 'user', 'active', 0, 'active', ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
  )
    .bind(id, `handle-${id}`, `User ${id}`, NOW, NOW)
    .run();
}

async function seedThemeVersion(args?: {
  themeId?: string;
  packageStatus?: string;
  generationState?: string;
  visibility?: string;
}) {
  const themeId = args?.themeId ?? THEME_ID;
  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES (?, 'u-job', ?, 'en', NULL, ?, 'clean', ?, 0, 0, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       package_status = excluded.package_status,
       visibility = excluded.visibility,
       updated_at = excluded.updated_at`,
  )
    .bind(
      themeId,
      `slug-${themeId}`,
      args?.visibility ?? "draft",
      args?.packageStatus ?? "processing",
      NOW,
      NOW,
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO theme_versions (
       id, theme_id, version, manifest_json, package_key,
       payload_digest, archive_digest, published_at,
       created_at, updated_at, creator_input_json, generation_state
     ) VALUES (?, ?, 1, '{}', NULL, NULL, NULL, NULL, ?, ?, '{}', ?)
     ON CONFLICT(theme_id, version) DO UPDATE SET
       generation_state = excluded.generation_state,
       updated_at = excluded.updated_at`,
  )
    .bind(
      `ver-${themeId}-1`,
      themeId,
      NOW,
      NOW,
      args?.generationState ?? "queued",
    )
    .run();
}

async function seedJob(args?: {
  id?: string;
  themeId?: string;
  state?: string;
  attempt?: number;
  maxAttempts?: number;
  availableAt?: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: number | null;
  idempotencyKey?: string;
}) {
  const id = args?.id ?? JOB_ID;
  const themeId = args?.themeId ?? THEME_ID;
  await env.DB.prepare(
    `INSERT INTO package_jobs (
       id, idempotency_key, theme_id, version, state,
       attempt, max_attempts, available_at,
       lease_owner, lease_expires_at,
       last_error_code, last_error_detail,
       created_at, updated_at, finished_at
     ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       state = excluded.state,
       attempt = excluded.attempt,
       max_attempts = excluded.max_attempts,
       available_at = excluded.available_at,
       lease_owner = excluded.lease_owner,
       lease_expires_at = excluded.lease_expires_at,
       updated_at = excluded.updated_at,
       finished_at = NULL,
       last_error_code = NULL,
       last_error_detail = NULL`,
  )
    .bind(
      id,
      args?.idempotencyKey ?? IDEMPOTENCY_KEY,
      themeId,
      args?.state ?? "queued",
      args?.attempt ?? 0,
      args?.maxAttempts ?? 5,
      args?.availableAt ?? NOW,
      args?.leaseOwner ?? null,
      args?.leaseExpiresAt ?? null,
      NOW,
      NOW,
    )
    .run();
}

async function jobState(db: D1Database, jobId: string) {
  const row = await db
    .prepare(`SELECT state FROM package_jobs WHERE id = ?`)
    .bind(jobId)
    .first<{ state: string }>();
  return row?.state ?? null;
}

async function loadJob(db: D1Database, jobId: string) {
  return db
    .prepare(`SELECT * FROM package_jobs WHERE id = ?`)
    .bind(jobId)
    .first<PackageJobRow>();
}

function createDeps(
  overrides?: Partial<PackageJobDeps> & {
    queueSend?: ReturnType<typeof vi.fn>;
  },
): PackageJobDeps & { queueSend: ReturnType<typeof vi.fn> } {
  const queueSend =
    overrides?.queueSend ??
    vi.fn(
      async (_message: unknown, _opts?: { delaySeconds?: number }) => undefined,
    );
  const sources = {
    head: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
  };
  const packages = {
    list: vi.fn(async () => ({
      objects: [] as Array<{ key: string; uploaded: Date }>,
      truncated: false,
      delimitedPrefixes: [] as string[],
    })),
    delete: vi.fn(async () => undefined),
  };

  return {
    db: env.DB,
    queue: {
      send: queueSend,
    },
    sources,
    packages: packages as unknown as R2Bucket,
    workerId: "worker-a",
    processPackageJob: async () => undefined,
    queueSend,
    ...overrides,
    queue: overrides?.queue ?? { send: queueSend },
  };
}

describe("package job leasing", () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM package_jobs`).run();
    await env.DB.prepare(`DELETE FROM source_uploads`).run();
    await env.DB.prepare(`DELETE FROM theme_translations`).run();
    await env.DB.prepare(`DELETE FROM theme_versions`).run();
    await env.DB.prepare(`DELETE FROM themes`).run();
    await env.DB.prepare(`DELETE FROM users`).run();
    await insertUser();
    await seedThemeVersion();
    await seedJob();
  });

  it("leases one job, ignores a duplicate delivery, and sweeps expiry", async () => {
    const now = new Date(NOW);
    const deps = createDeps();

    const first = await leaseJob(env.DB, JOB_ID, "worker-a", now);
    expect(first).toMatchObject({ state: "leased", attempt: 1 });
    expect(await leaseJob(env.DB, JOB_ID, "worker-b", now)).toBeNull();

    await sweepExpiredJobs(deps, new Date(now.getTime() + 301_000));
    expect(await jobState(env.DB, JOB_ID)).toBe("queued");
    expect(deps.queue.send).toHaveBeenCalledWith({
      jobId: JOB_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
  });

  it("finishJob only succeeds for the owning lease", async () => {
    const now = new Date(NOW);
    const leased = await leaseJob(env.DB, JOB_ID, "worker-a", now);
    expect(leased?.state).toBe("leased");

    expect(await finishJob(env.DB, JOB_ID, "worker-b", now)).toBe(false);
    expect(await jobState(env.DB, JOB_ID)).toBe("leased");

    expect(await finishJob(env.DB, JOB_ID, "worker-a", now)).toBe(true);
    const finished = await loadJob(env.DB, JOB_ID);
    expect(finished).toMatchObject({
      state: "succeeded",
      lease_owner: null,
      lease_expires_at: null,
    });
    expect(finished?.finished_at).toBe(NOW);
  });

  it("failJob retries with delays [30,120,600,1800] and re-enqueues after D1", async () => {
    const deps = createDeps();
    const now = new Date(NOW);

    for (let i = 0; i < RETRY_DELAYS_SECONDS.length; i += 1) {
      deps.queueSend.mockClear();
      const leased = await leaseJob(env.DB, JOB_ID, "worker-a", now);
      expect(leased?.attempt).toBe(i + 1);

      const outcome = await failJob(deps, {
        jobId: JOB_ID,
        owner: "worker-a",
        code: "transient_error",
        detail: "boom",
        retryable: true,
        now,
      });

      expect(outcome).toMatchObject({
        kind: "retry",
        delaySeconds: RETRY_DELAYS_SECONDS[i],
      });
      const row = await loadJob(env.DB, JOB_ID);
      expect(row).toMatchObject({
        state: "queued",
        lease_owner: null,
        lease_expires_at: null,
        last_error_code: "transient_error",
        last_error_detail: "boom",
        available_at: NOW + RETRY_DELAYS_SECONDS[i]! * 1000,
      });
      expect(deps.queue.send).toHaveBeenCalledWith(
        { jobId: JOB_ID, idempotencyKey: IDEMPOTENCY_KEY },
        { delaySeconds: RETRY_DELAYS_SECONDS[i] },
      );

      // Make job available for next lease attempt.
      await env.DB.prepare(
        `UPDATE package_jobs SET available_at = ? WHERE id = ?`,
      )
        .bind(NOW, JOB_ID)
        .run();
    }
  });

  it("lost ownership does not poison theme package_status", async () => {
    const deps = createDeps();
    const now = new Date(NOW);
    await leaseJob(env.DB, JOB_ID, "worker-a", now);

    // Simulate lease expiry / reassignment before worker-a fails permanently.
    await env.DB.prepare(
      `UPDATE package_jobs
       SET lease_owner = 'worker-b',
           lease_expires_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
      .bind(NOW + LEASE_MS, NOW, JOB_ID)
      .run();

    // Keep theme in a non-failed processing state to detect poisoning.
    await env.DB.prepare(
      `UPDATE themes SET package_status = 'processing' WHERE id = ?`,
    )
      .bind(THEME_ID)
      .run();
    await env.DB.prepare(
      `UPDATE theme_versions
       SET generation_state = 'processing',
           generation_error_code = NULL,
           generation_error_detail = NULL
       WHERE theme_id = ? AND version = 1`,
    )
      .bind(THEME_ID)
      .run();

    const outcome = await failJob(deps, {
      jobId: JOB_ID,
      owner: "worker-a",
      code: "ownership_lost_poison",
      detail: "should not apply",
      retryable: false,
      now,
    });

    expect(outcome).toEqual({ kind: "ignored" });

    const job = await loadJob(env.DB, JOB_ID);
    expect(job).toMatchObject({
      state: "leased",
      lease_owner: "worker-b",
    });

    const theme = await env.DB.prepare(
      `SELECT package_status FROM themes WHERE id = ?`,
    )
      .bind(THEME_ID)
      .first<{ package_status: string }>();
    expect(theme?.package_status).toBe("processing");

    const version = await env.DB.prepare(
      `SELECT generation_state, generation_error_code FROM theme_versions
       WHERE theme_id = ? AND version = 1`,
    )
      .bind(THEME_ID)
      .first<{
        generation_state: string;
        generation_error_code: string | null;
      }>();
    expect(version).toMatchObject({
      generation_state: "processing",
      generation_error_code: null,
    });
  });

  it("failJob permanent failure marks job/version/theme failed and keeps draft", async () => {
    const deps = createDeps();
    const now = new Date(NOW);
    await leaseJob(env.DB, JOB_ID, "worker-a", now);

    const longDetail = "x".repeat(600);
    const outcome = await failJob(deps, {
      jobId: JOB_ID,
      owner: "worker-a",
      code: "unsupported_signature",
      detail: longDetail,
      retryable: false,
      now,
    });

    expect(outcome).toEqual({ kind: "permanent" });
    expect(deps.queue.send).not.toHaveBeenCalled();

    const job = await loadJob(env.DB, JOB_ID);
    expect(job).toMatchObject({
      state: "failed",
      last_error_code: "unsupported_signature",
      lease_owner: null,
    });
    expect(job?.last_error_detail?.length).toBe(500);
    expect(job?.finished_at).toBe(NOW);

    const version = await env.DB.prepare(
      `SELECT generation_state, generation_error_code FROM theme_versions
       WHERE theme_id = ? AND version = 1`,
    )
      .bind(THEME_ID)
      .first<{ generation_state: string; generation_error_code: string }>();
    expect(version).toMatchObject({
      generation_state: "failed",
      generation_error_code: "unsupported_signature",
    });

    const theme = await env.DB.prepare(
      `SELECT package_status, visibility FROM themes WHERE id = ?`,
    )
      .bind(THEME_ID)
      .first<{ package_status: string; visibility: string }>();
    expect(theme).toMatchObject({
      package_status: "failed",
      visibility: "draft",
    });
  });

  it("failJob exhausts attempts after the final lease", async () => {
    const deps = createDeps();
    const now = new Date(NOW);
    await seedJob({ attempt: 4, maxAttempts: 5 });
    await leaseJob(env.DB, JOB_ID, "worker-a", now); // attempt -> 5

    const outcome = await failJob(deps, {
      jobId: JOB_ID,
      owner: "worker-a",
      code: "decode_failed",
      detail: "still broken",
      retryable: true,
      now,
    });

    expect(outcome).toEqual({ kind: "exhausted" });
    expect(deps.queue.send).not.toHaveBeenCalled();
    expect(await jobState(env.DB, JOB_ID)).toBe("failed");

    const theme = await env.DB.prepare(
      `SELECT package_status, visibility FROM themes WHERE id = ?`,
    )
      .bind(THEME_ID)
      .first<{ package_status: string; visibility: string }>();
    expect(theme).toMatchObject({
      package_status: "failed",
      visibility: "draft",
    });
  });

  it("consumePackageMessage leases once, ignores duplicates, and uses injectable processor", async () => {
    const processPackageJob = vi.fn(async () => undefined);
    const deps = createDeps({ processPackageJob, workerId: "worker-a" });
    const now = new Date(NOW);

    const first = await consumePackageMessage(
      deps,
      { jobId: JOB_ID, idempotencyKey: IDEMPOTENCY_KEY },
      now,
    );
    expect(first).toEqual({ kind: "ack" });
    expect(processPackageJob).toHaveBeenCalledOnce();
    expect(await jobState(env.DB, JOB_ID)).toBe("succeeded");

    processPackageJob.mockClear();
    const second = await consumePackageMessage(
      deps,
      { jobId: JOB_ID, idempotencyKey: IDEMPOTENCY_KEY },
      now,
    );
    expect(second).toEqual({ kind: "ack" });
    expect(processPackageJob).not.toHaveBeenCalled();
  });

  it("consumePackageMessage routes processor failures through failJob", async () => {
    const processPackageJob = vi.fn(async () => {
      const err = new Error("network blip");
      (err as Error & { code?: string; retryable?: boolean }).code =
        "images_unavailable";
      (err as Error & { code?: string; retryable?: boolean }).retryable = true;
      throw err;
    });
    const deps = createDeps({ processPackageJob });
    const now = new Date(NOW);

    // Prefer PackageJobError shape via throwing plain Error — service should treat
    // unknown errors as retryable unless marked permanent.
    const outcome = await consumePackageMessage(
      deps,
      { jobId: JOB_ID, idempotencyKey: IDEMPOTENCY_KEY },
      now,
    );
    expect(outcome.kind).toBe("ack"); // failJob re-enqueues itself
    expect(await jobState(env.DB, JOB_ID)).toBe("queued");
    expect(deps.queue.send).toHaveBeenCalled();
  });

  it("sweep requeues due queued jobs and marks exhausted leases failed", async () => {
    const deps = createDeps();
    // Message-lost: queued + due + attempt under max.
    await seedJob({
      id: "job-due",
      themeId: THEME_ID,
      idempotencyKey: "package:t1:due",
      state: "queued",
      attempt: 1,
      availableAt: NOW - 1_000,
    });

    // Exhausted expired lease.
    await seedThemeVersion({ themeId: "t2" });
    await seedJob({
      id: "job-exhausted",
      themeId: "t2",
      idempotencyKey: "package:t2:1",
      state: "leased",
      attempt: 5,
      maxAttempts: 5,
      leaseOwner: "dead-worker",
      leaseExpiresAt: NOW - 1_000,
      availableAt: NOW - 10_000,
    });

    await sweepExpiredJobs(deps, new Date(NOW));

    expect(deps.queue.send).toHaveBeenCalledWith({
      jobId: "job-due",
      idempotencyKey: "package:t1:due",
    });
    expect(await jobState(env.DB, "job-exhausted")).toBe("failed");

    const theme2 = await env.DB.prepare(
      `SELECT package_status, visibility FROM themes WHERE id = 't2'`,
    ).first<{ package_status: string; visibility: string }>();
    expect(theme2).toMatchObject({
      package_status: "failed",
      visibility: "draft",
    });
  });

  it("sweep deletes expired quarantine objects and old staging zips", async () => {
    const sources = {
      head: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
    };
    const packages = {
      list: vi.fn(async () => ({
        objects: [
          {
            key: "staging/zips/old.zip",
            uploaded: new Date(NOW - 3_600_000 - 1),
          },
          {
            key: "staging/zips/fresh.zip",
            uploaded: new Date(NOW - 60_000),
          },
        ],
        truncated: false,
        delimitedPrefixes: [],
      })),
      delete: vi.fn(async () => undefined),
    };

    await env.DB.prepare(
      `INSERT INTO source_uploads (
         id, theme_id, version, user_id, quarantine_key,
         declared_content_type, expected_bytes, state, r2_etag,
         expires_at, completed_at, created_at
       ) VALUES ('up-exp', ?, 1, 'u-job', 'quarantine/expired',
         'image/png', 100, 'issued', NULL, ?, NULL, ?)`,
    )
      .bind(THEME_ID, NOW - 1, NOW)
      .run();

    const deps = createDeps({
      sources,
      packages: packages as unknown as R2Bucket,
    });

    await sweepExpiredJobs(deps, new Date(NOW));

    expect(sources.delete).toHaveBeenCalledWith("quarantine/expired");
    expect(packages.delete).toHaveBeenCalledWith("staging/zips/old.zip");
    expect(packages.delete).not.toHaveBeenCalledWith("staging/zips/fresh.zip");
  });
});
