import { createPackageQueue } from "~/platform/cloudflare/package-queue.server";
import { createSourceObjectStore } from "~/platform/cloudflare/r2-sources.server";
import type {
  PackageQueue,
  PackageQueueMessage,
  SourceObjectStore,
} from "~/platform/ports";

/** Lease duration: 5 minutes. */
export const LEASE_MS = 300_000;

/** Retry backoff after attempts 1–4 (seconds). */
export const RETRY_DELAYS_SECONDS = [30, 120, 600, 1800] as const;

/** Staging zip retention before sweeper deletion. */
export const STAGING_ZIP_MAX_AGE_MS = 3_600_000;

/** Scrubbed error detail cap. */
export const MAX_ERROR_DETAIL_CHARS = 500;

export type PackageJobState = "queued" | "leased" | "succeeded" | "failed";

export type PackageJobRow = {
  id: string;
  idempotency_key: string;
  theme_id: string;
  version: number;
  state: PackageJobState;
  attempt: number;
  max_attempts: number;
  available_at: number;
  lease_owner: string | null;
  lease_expires_at: number | null;
  last_error_code: string | null;
  last_error_detail: string | null;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
};

export type PackageJobErrorCode = string;

/**
 * Structured processor failure. `retryable` drives failJob backoff vs permanent.
 */
export class PackageJobError extends Error {
  readonly code: PackageJobErrorCode;
  readonly retryable: boolean;

  constructor(code: PackageJobErrorCode, retryable: boolean, detail?: string) {
    super(detail ?? code);
    this.name = "PackageJobError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type PackageJobDeps = {
  db: D1Database;
  queue: PackageQueue;
  sources: SourceObjectStore;
  /** Optional PACKAGES binding for staging/zips cleanup. */
  packages?: Pick<R2Bucket, "list" | "delete"> | null;
  workerId?: string;
  /**
   * Injectable package builder hook (Task 7). Defaults to success no-op so Task 4
   * can focus on lease/retry/sweep without the full builder.
   */
  processPackageJob?: (job: PackageJobRow) => Promise<void>;
};

export type FailJobInput = {
  jobId: string;
  owner: string;
  code: string;
  detail?: string;
  retryable: boolean;
  now?: Date;
};

export type FailJobOutcome =
  | { kind: "retry"; delaySeconds: number }
  | { kind: "permanent" }
  | { kind: "exhausted" }
  | { kind: "ignored" };

export type ConsumeOutcome =
  | { kind: "ack" }
  | { kind: "retry"; delaySeconds: number };

export function scrubErrorDetail(detail: string | undefined | null): string {
  const raw = (detail ?? "").replace(/\s+/g, " ").trim();
  if (raw.length <= MAX_ERROR_DETAIL_CHARS) return raw;
  return raw.slice(0, MAX_ERROR_DETAIL_CHARS);
}

export function retryDelaySeconds(attempt: number): number {
  const index = Math.max(0, attempt - 1);
  if (index < RETRY_DELAYS_SECONDS.length) {
    return RETRY_DELAYS_SECONDS[index]!;
  }
  return RETRY_DELAYS_SECONDS[RETRY_DELAYS_SECONDS.length - 1]!;
}

/**
 * Conditionally lease a queued job: queued → leased, attempt++, 5-minute lease.
 * Only when available_at <= now and attempt < max_attempts.
 */
export async function leaseJob(
  db: D1Database,
  jobId: string,
  owner: string,
  now = new Date(),
): Promise<PackageJobRow | null> {
  const nowMs = now.getTime();
  const leaseExpires = nowMs + LEASE_MS;

  const result = await db
    .prepare(
      `UPDATE package_jobs
       SET state = 'leased',
           attempt = attempt + 1,
           lease_owner = ?,
           lease_expires_at = ?,
           updated_at = ?
       WHERE id = ?
         AND state = 'queued'
         AND available_at <= ?
         AND attempt < max_attempts`,
    )
    .bind(owner, leaseExpires, nowMs, jobId, nowMs)
    .run();

  if (result.meta.changes !== 1) return null;

  return db
    .prepare(`SELECT * FROM package_jobs WHERE id = ?`)
    .bind(jobId)
    .first<PackageJobRow>();
}

/**
 * Mark an owned lease as succeeded. Returns false if ownership check fails.
 */
export async function finishJob(
  db: D1Database,
  jobId: string,
  owner: string,
  now = new Date(),
): Promise<boolean> {
  const nowMs = now.getTime();
  const result = await db
    .prepare(
      `UPDATE package_jobs
       SET state = 'succeeded',
           lease_owner = NULL,
           lease_expires_at = NULL,
           finished_at = ?,
           updated_at = ?
       WHERE id = ?
         AND state = 'leased'
         AND lease_owner = ?`,
    )
    .bind(nowMs, nowMs, jobId, owner)
    .run();

  return result.meta.changes === 1;
}

/**
 * Fail an owned lease. Retryable failures use delays [30,120,600,1800], clear lease,
 * set queued, and send after D1 succeeds. Permanent/exhausted set job/version/theme
 * package_status failed; visibility stays private (draft).
 */
export async function failJob(
  deps: PackageJobDeps,
  input: FailJobInput,
): Promise<FailJobOutcome> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const detail = scrubErrorDetail(input.detail);

  const job = await deps.db
    .prepare(`SELECT * FROM package_jobs WHERE id = ?`)
    .bind(input.jobId)
    .first<PackageJobRow>();

  if (!job || job.state !== "leased" || job.lease_owner !== input.owner) {
    return { kind: "ignored" };
  }

  const canRetry =
    input.retryable && job.attempt < job.max_attempts;

  if (canRetry) {
    const delaySeconds = retryDelaySeconds(job.attempt);
    const availableAt = nowMs + delaySeconds * 1000;

    const result = await deps.db
      .prepare(
        `UPDATE package_jobs
         SET state = 'queued',
             lease_owner = NULL,
             lease_expires_at = NULL,
             available_at = ?,
             last_error_code = ?,
             last_error_detail = ?,
             updated_at = ?
         WHERE id = ?
           AND state = 'leased'
           AND lease_owner = ?`,
      )
      .bind(
        availableAt,
        input.code,
        detail,
        nowMs,
        input.jobId,
        input.owner,
      )
      .run();

    if (result.meta.changes !== 1) return { kind: "ignored" };

    await deps.queue.send(
      {
        jobId: job.id,
        idempotencyKey: job.idempotency_key,
      },
      { delaySeconds },
    );

    return { kind: "retry", delaySeconds };
  }

  const exhausted = input.retryable && job.attempt >= job.max_attempts;
  await markJobFailed(deps.db, {
    job,
    code: input.code,
    detail,
    nowMs,
    owner: input.owner,
  });

  return exhausted ? { kind: "exhausted" } : { kind: "permanent" };
}

async function markJobFailed(
  db: D1Database,
  args: {
    job: PackageJobRow;
    code: string;
    detail: string;
    nowMs: number;
    owner?: string | null;
  },
): Promise<void> {
  const ownerClause =
    args.owner != null
      ? `AND state = 'leased' AND lease_owner = ?`
      : `AND state IN ('leased', 'queued')`;

  const jobUpdate = db.prepare(
    `UPDATE package_jobs
     SET state = 'failed',
         lease_owner = NULL,
         lease_expires_at = NULL,
         last_error_code = ?,
         last_error_detail = ?,
         finished_at = ?,
         updated_at = ?
     WHERE id = ?
       ${ownerClause}`,
  );

  const binds =
    args.owner != null
      ? [
          args.code,
          args.detail,
          args.nowMs,
          args.nowMs,
          args.job.id,
          args.owner,
        ]
      : [args.code, args.detail, args.nowMs, args.nowMs, args.job.id];

  await jobUpdate.bind(...binds).run();

  await db.batch([
    db
      .prepare(
        `UPDATE theme_versions
         SET generation_state = 'failed',
             generation_error_code = ?,
             generation_error_detail = ?,
             updated_at = ?
         WHERE theme_id = ? AND version = ?`,
      )
      .bind(
        args.code,
        args.detail,
        args.nowMs,
        args.job.theme_id,
        args.job.version,
      ),
    db
      .prepare(
        `UPDATE themes
         SET package_status = 'failed',
             updated_at = ?
         WHERE id = ?
           AND visibility IN ('draft', 'unlisted', 'hidden', 'public')`,
      )
      .bind(args.nowMs, args.job.theme_id),
  ]);
  // Intentionally do not change visibility — failed processing stays private/draft.
}

/**
 * Queue consumer entry: lease once, run injectable processor, finish/fail.
 * Full package builder is Task 7; default processor is a success no-op.
 */
export async function consumePackageMessage(
  deps: PackageJobDeps,
  message: PackageQueueMessage,
  now = new Date(),
): Promise<ConsumeOutcome> {
  const owner = deps.workerId ?? "package-worker";
  const leased = await leaseJob(deps.db, message.jobId, owner, now);
  if (!leased) {
    // Duplicate delivery, not yet available, or terminal state.
    return { kind: "ack" };
  }

  // Mark version processing (best-effort; builder Task 7 owns full transitions).
  await deps.db
    .prepare(
      `UPDATE theme_versions
       SET generation_state = 'processing', updated_at = ?
       WHERE theme_id = ? AND version = ?
         AND generation_state IN ('queued', 'processing', 'failed')`,
    )
    .bind(now.getTime(), leased.theme_id, leased.version)
    .run();

  const process =
    deps.processPackageJob ??
    (async () => {
      // Task 4 stub: success no-op until package builder lands.
    });

  try {
    await process(leased);
    const ok = await finishJob(deps.db, leased.id, owner, now);
    if (!ok) {
      // Lost ownership mid-flight; leave state for sweeper.
      return { kind: "ack" };
    }
    return { kind: "ack" };
  } catch (err) {
    const { code, detail, retryable } = normalizeProcessorError(err);
    await failJob(deps, {
      jobId: leased.id,
      owner,
      code,
      detail,
      retryable,
      now,
    });
    // failJob re-enqueues retryable work itself; always ack the current message.
    return { kind: "ack" };
  }
}

function normalizeProcessorError(err: unknown): {
  code: string;
  detail: string;
  retryable: boolean;
} {
  if (err instanceof PackageJobError) {
    return {
      code: err.code,
      detail: err.message,
      retryable: err.retryable,
    };
  }
  if (err instanceof Error) {
    const withFlags = err as Error & {
      code?: string;
      retryable?: boolean;
    };
    return {
      code: withFlags.code ?? "processing_error",
      detail: err.message,
      retryable: withFlags.retryable !== false,
    };
  }
  return {
    code: "processing_error",
    detail: String(err),
    retryable: true,
  };
}

/**
 * Sweeper:
 * - requeue expired leases (attempt < max)
 * - requeue due queued jobs (message may have been lost) via queue.send
 * - mark exhausted failed
 * - delete expired quarantine objects (source_uploads.expires_at)
 * - delete staging/zips/* older than 1 hour if PACKAGES list available
 */
export async function sweepExpiredJobs(
  deps: PackageJobDeps,
  now = new Date(),
): Promise<void> {
  const nowMs = now.getTime();

  // 1) Expired leases that can still be retried → requeue + send
  const expiredLeases = await deps.db
    .prepare(
      `SELECT * FROM package_jobs
       WHERE state = 'leased'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at < ?
         AND attempt < max_attempts`,
    )
    .bind(nowMs)
    .all<PackageJobRow>();

  for (const job of expiredLeases.results ?? []) {
    const result = await deps.db
      .prepare(
        `UPDATE package_jobs
         SET state = 'queued',
             lease_owner = NULL,
             lease_expires_at = NULL,
             available_at = ?,
             updated_at = ?
         WHERE id = ?
           AND state = 'leased'
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at < ?`,
      )
      .bind(nowMs, nowMs, job.id, nowMs)
      .run();

    if (result.meta.changes === 1) {
      await deps.queue.send({
        jobId: job.id,
        idempotencyKey: job.idempotency_key,
      });
    }
  }

  // 2) Exhausted expired leases / over-attempt jobs → permanent fail
  const exhausted = await deps.db
    .prepare(
      `SELECT * FROM package_jobs
       WHERE (
           (state = 'leased'
             AND lease_expires_at IS NOT NULL
             AND lease_expires_at < ?
             AND attempt >= max_attempts)
           OR
           (state = 'queued'
             AND available_at <= ?
             AND attempt >= max_attempts)
         )`,
    )
    .bind(nowMs, nowMs)
    .all<PackageJobRow>();

  for (const job of exhausted.results ?? []) {
    await markJobFailed(deps.db, {
      job,
      code: job.last_error_code ?? "attempts_exhausted",
      detail: scrubErrorDetail(
        job.last_error_detail ?? "max attempts exhausted",
      ),
      nowMs,
      owner: null,
    });
  }

  // 3) Due queued jobs whose message may have been lost → re-send
  const dueQueued = await deps.db
    .prepare(
      `SELECT id, idempotency_key FROM package_jobs
       WHERE state = 'queued'
         AND available_at <= ?
         AND attempt < max_attempts`,
    )
    .bind(nowMs)
    .all<{ id: string; idempotency_key: string }>();

  for (const job of dueQueued.results ?? []) {
    await deps.queue.send({
      jobId: job.id,
      idempotencyKey: job.idempotency_key,
    });
  }

  // 4) Expired quarantine objects
  const expiredUploads = await deps.db
    .prepare(
      `SELECT id, quarantine_key FROM source_uploads
       WHERE expires_at < ?
         AND state = 'issued'`,
    )
    .bind(nowMs)
    .all<{ id: string; quarantine_key: string }>();

  for (const upload of expiredUploads.results ?? []) {
    try {
      await deps.sources.delete(upload.quarantine_key);
    } catch {
      // Object may already be gone.
    }
    await deps.db
      .prepare(
        `UPDATE source_uploads
         SET state = 'rejected', completed_at = ?
         WHERE id = ? AND state = 'issued'`,
      )
      .bind(nowMs, upload.id)
      .run();
  }

  // 5) staging/zips older than 1 hour
  if (deps.packages) {
    try {
      const listed = await deps.packages.list({ prefix: "staging/zips/" });
      const cutoff = nowMs - STAGING_ZIP_MAX_AGE_MS;
      for (const obj of listed.objects) {
        const uploaded =
          obj.uploaded instanceof Date
            ? obj.uploaded.getTime()
            : new Date(obj.uploaded).getTime();
        if (uploaded < cutoff) {
          await deps.packages.delete(obj.key);
        }
      }
    } catch {
      // List may be unavailable in some test/env bindings.
    }
  }
}

/** Wire Cloudflare env into package-job deps for queue/scheduled handlers. */
export function createJobDeps(
  env: Env,
  overrides?: Partial<PackageJobDeps>,
): PackageJobDeps {
  return {
    db: env.DB,
    queue: createPackageQueue(env.PACKAGE_QUEUE),
    sources: createSourceObjectStore(env.SOURCES),
    packages: env.PACKAGES,
    workerId: crypto.randomUUID(),
    ...overrides,
  };
}
