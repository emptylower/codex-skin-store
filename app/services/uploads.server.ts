import type {
  ObjectPresigner,
  PackageQueue,
  SourceObjectStore,
} from "~/platform/ports";

export const MAX_SOURCE_BYTES = 25_000_000;
export const PRESIGN_TTL_MS = 600_000;

const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type UploadErrorCode =
  | "invalid_input"
  | "forbidden"
  | "not_found"
  | "expired"
  | "invalid_state"
  | "size_mismatch"
  | "metadata_mismatch"
  | "object_missing"
  | "content_type_rejected"
  | "bytes_out_of_range"
  | "already_completed";

export class UploadError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode, message?: string) {
    super(message ?? code);
    this.name = "UploadError";
    this.code = code;
  }
}

export type UploadDeps = {
  db: D1Database;
  sources: SourceObjectStore;
  queue: PackageQueue;
  presign: ObjectPresigner;
  now?: () => number;
};

export type IssueUploadInput = {
  userId: string;
  themeId: string;
  version: number;
  contentType: string;
  bytes: number;
};

export type IssuedUpload = {
  uploadId: string;
  key: string;
  url: string;
  headers: Record<string, string>;
  expiresAt: number;
};

export type CompleteUploadInput = {
  userId: string;
  uploadId: string;
};

/**
 * Issue a single draft-bound quarantine presign for an awaiting_upload version.
 * One upload row per (themeId, version); re-issue replaces only while still issued.
 */
export async function issueUpload(
  deps: UploadDeps,
  input: IssueUploadInput,
): Promise<IssuedUpload> {
  if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
    throw new UploadError("content_type_rejected");
  }
  if (
    !Number.isInteger(input.bytes) ||
    input.bytes < 1 ||
    input.bytes > MAX_SOURCE_BYTES
  ) {
    throw new UploadError("bytes_out_of_range");
  }

  await assertUserCanUpload(deps, input.userId);

  const now = deps.now?.() ?? Date.now();

  const row = await deps.db
    .prepare(
      `SELECT
         t.id AS theme_id,
         t.author_id AS author_id,
         t.visibility AS visibility,
         v.version AS version,
         v.generation_state AS generation_state
       FROM themes t
       INNER JOIN theme_versions v
         ON v.theme_id = t.id AND v.version = ?
       WHERE t.id = ?`,
    )
    .bind(input.version, input.themeId)
    .first<{
      theme_id: string;
      author_id: string;
      visibility: string;
      version: number;
      generation_state: string;
    }>();

  if (!row) {
    throw new UploadError("not_found");
  }
  if (row.author_id !== input.userId) {
    throw new UploadError("forbidden");
  }
  // Draft, public, and unlisted themes may upload a new awaiting_upload version.
  // Hidden themes cannot start uploads (moderation/admin control).
  if (row.visibility === "hidden") {
    throw new UploadError("invalid_state", "theme_hidden");
  }

  const existing = await deps.db
    .prepare(
      `SELECT id, state, quarantine_key, declared_content_type, expected_bytes, expires_at
       FROM source_uploads
       WHERE theme_id = ? AND version = ?`,
    )
    .bind(input.themeId, input.version)
    .first<{
      id: string;
      state: string;
      quarantine_key: string;
      declared_content_type: string;
      expected_bytes: number;
      expires_at: number;
    }>();

  // Prefer completed/finalized upload errors over generation-state mismatch so
  // re-issue after complete surfaces a clear conflict.
  if (existing && existing.state !== "issued") {
    throw new UploadError(
      existing.state === "completed" ? "already_completed" : "invalid_state",
      "upload_already_finalized",
    );
  }
  if (row.generation_state !== "awaiting_upload") {
    throw new UploadError("invalid_state", "version_not_awaiting_upload");
  }

  const uploadId = existing?.id ?? crypto.randomUUID();
  const key = `quarantine/${input.themeId}/versions/${input.version}/${crypto.randomUUID()}`;
  const expiresAt = now + PRESIGN_TTL_MS;

  if (existing) {
    // Drop previous quarantine object if a re-issue replaces the key.
    if (existing.quarantine_key !== key) {
      try {
        await deps.sources.delete(existing.quarantine_key);
      } catch {
        // Best-effort cleanup; completion path also deletes mismatches.
      }
    }

    const updateResult = await deps.db
      .prepare(
        `UPDATE source_uploads
         SET quarantine_key = ?,
             declared_content_type = ?,
             expected_bytes = ?,
             state = 'issued',
             r2_etag = NULL,
             expires_at = ?,
             completed_at = NULL,
             created_at = ?
         WHERE id = ? AND state = 'issued'`,
      )
      .bind(
        key,
        input.contentType,
        input.bytes,
        expiresAt,
        now,
        uploadId,
      )
      .run();

    if (updateResult.meta.changes !== 1) {
      // Lost the race: another request completed (or rejected) this upload.
      const current = await deps.db
        .prepare(
          `SELECT id, state, quarantine_key, declared_content_type, expected_bytes, expires_at
           FROM source_uploads WHERE id = ?`,
        )
        .bind(uploadId)
        .first<{
          id: string;
          state: string;
          quarantine_key: string;
          declared_content_type: string;
          expected_bytes: number;
          expires_at: number;
        }>();

      if (!current) {
        throw new UploadError("not_found");
      }
      if (current.state === "issued") {
        // Another re-issue won; return that issued upload's presign.
        return signIssued(deps, {
          uploadId: current.id,
          key: current.quarantine_key,
          contentType: current.declared_content_type,
          bytes: current.expected_bytes,
          expiresAt: current.expires_at,
        });
      }
      if (current.state === "completed") {
        throw new UploadError("already_completed", "upload_already_finalized");
      }
      throw new UploadError("invalid_state", "upload_already_finalized");
    }
  } else {
    try {
      await deps.db
        .prepare(
          `INSERT INTO source_uploads (
             id, theme_id, version, user_id, quarantine_key,
             declared_content_type, expected_bytes, state,
             r2_etag, expires_at, completed_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', NULL, ?, NULL, ?)`,
        )
        .bind(
          uploadId,
          input.themeId,
          input.version,
          input.userId,
          key,
          input.contentType,
          input.bytes,
          expiresAt,
          now,
        )
        .run();
    } catch {
      // Unique constraint race: another issuer inserted first.
      const current = await deps.db
        .prepare(
          `SELECT id, state, quarantine_key, declared_content_type, expected_bytes, expires_at
           FROM source_uploads
           WHERE theme_id = ? AND version = ?`,
        )
        .bind(input.themeId, input.version)
        .first<{
          id: string;
          state: string;
          quarantine_key: string;
          declared_content_type: string;
          expected_bytes: number;
          expires_at: number;
        }>();

      if (!current) {
        throw new UploadError("invalid_state", "upload_insert_conflict");
      }
      if (current.state === "issued") {
        return signIssued(deps, {
          uploadId: current.id,
          key: current.quarantine_key,
          contentType: current.declared_content_type,
          bytes: current.expected_bytes,
          expiresAt: current.expires_at,
        });
      }
      if (current.state === "completed") {
        throw new UploadError("already_completed", "upload_already_finalized");
      }
      throw new UploadError("invalid_state", "upload_already_finalized");
    }
  }

  return signIssued(deps, {
    uploadId,
    key,
    contentType: input.contentType,
    bytes: input.bytes,
    expiresAt,
  });
}

/**
 * Verify the quarantine object and enqueue package generation once.
 * Repeated complete calls are idempotent: queue send only when the
 * package_jobs insert changes one row (or recovery inserts a missing job).
 */
export async function completeUpload(
  deps: UploadDeps,
  input: CompleteUploadInput,
): Promise<{ jobId: string | null; queued: boolean }> {
  await assertUserCanUpload(deps, input.userId);

  const now = deps.now?.() ?? Date.now();

  const row = await deps.db
    .prepare(
      `SELECT
         u.id AS upload_id,
         u.user_id AS upload_user_id,
         u.theme_id AS theme_id,
         u.version AS version,
         u.quarantine_key AS quarantine_key,
         u.expected_bytes AS expected_bytes,
         u.state AS upload_state,
         u.expires_at AS expires_at,
         t.author_id AS author_id,
         t.visibility AS visibility,
         v.generation_state AS generation_state
       FROM source_uploads u
       INNER JOIN themes t ON t.id = u.theme_id
       INNER JOIN theme_versions v
         ON v.theme_id = u.theme_id AND v.version = u.version
       WHERE u.id = ?`,
    )
    .bind(input.uploadId)
    .first<{
      upload_id: string;
      upload_user_id: string;
      theme_id: string;
      version: number;
      quarantine_key: string;
      expected_bytes: number;
      upload_state: string;
      expires_at: number;
      author_id: string;
      visibility: string;
      generation_state: string;
    }>();

  if (!row) {
    throw new UploadError("not_found");
  }
  if (row.author_id !== input.userId || row.upload_user_id !== input.userId) {
    throw new UploadError("forbidden");
  }

  // Idempotent success / recovery for already-completed uploads.
  if (row.upload_state === "completed") {
    return ensurePackageJob(deps, {
      themeId: row.theme_id,
      version: row.version,
      now,
    });
  }

  if (row.upload_state !== "issued") {
    throw new UploadError("invalid_state", "upload_not_issued");
  }
  if (row.expires_at < now) {
    await rejectAndDelete(deps, row.upload_id, row.quarantine_key, now);
    throw new UploadError("expired");
  }
  // Allow complete for draft/public/unlisted while a version is awaiting_upload.
  if (row.visibility === "hidden") {
    await rejectAndDelete(deps, row.upload_id, row.quarantine_key, now);
    throw new UploadError("invalid_state", "theme_hidden");
  }
  if (row.generation_state !== "awaiting_upload") {
    await rejectAndDelete(deps, row.upload_id, row.quarantine_key, now);
    throw new UploadError("invalid_state", "version_not_awaiting_upload");
  }

  const head = await deps.sources.head(row.quarantine_key);
  if (!head) {
    await rejectAndDelete(deps, row.upload_id, row.quarantine_key, now);
    throw new UploadError("object_missing");
  }

  const metaUploadId =
    head.customMetadata["upload-id"] ??
    head.customMetadata["upload_id"] ??
    "";
  const metaExpected =
    head.customMetadata["expected-bytes"] ??
    head.customMetadata["expected_bytes"] ??
    "";

  const sizeOk =
    head.size === row.expected_bytes && head.size <= MAX_SOURCE_BYTES;
  const metaOk =
    metaUploadId === row.upload_id &&
    metaExpected === String(row.expected_bytes);

  if (!sizeOk || !metaOk || !head.etag) {
    await rejectAndDelete(deps, row.upload_id, row.quarantine_key, now);
    throw new UploadError(
      !sizeOk ? "size_mismatch" : "metadata_mismatch",
    );
  }

  // Mark upload completed and advance generation state; only the winner proceeds.
  const batchResults = await deps.db.batch([
    deps.db
      .prepare(
        `UPDATE source_uploads
         SET state = 'completed', r2_etag = ?, completed_at = ?
         WHERE id = ? AND state = 'issued'`,
      )
      .bind(head.etag, now, row.upload_id),
    deps.db
      .prepare(
        `UPDATE theme_versions
         SET generation_state = 'queued',
             source_key = ?,
             source_mime = (
               SELECT declared_content_type FROM source_uploads WHERE id = ?
             ),
             source_bytes = ?,
             updated_at = ?
         WHERE theme_id = ? AND version = ? AND generation_state = 'awaiting_upload'`,
      )
      .bind(
        row.quarantine_key,
        row.upload_id,
        row.expected_bytes,
        now,
        row.theme_id,
        row.version,
      ),
  ]);

  const uploadTransitioned = batchResults[0]?.meta.changes === 1;

  if (!uploadTransitioned) {
    // Lost the race: re-read and either recover idempotently or fail.
    const current = await deps.db
      .prepare(
        `SELECT
           u.state AS upload_state,
           v.generation_state AS generation_state
         FROM source_uploads u
         INNER JOIN theme_versions v
           ON v.theme_id = u.theme_id AND v.version = u.version
         WHERE u.id = ?`,
      )
      .bind(row.upload_id)
      .first<{ upload_state: string; generation_state: string }>();

    if (!current) {
      throw new UploadError("not_found");
    }
    if (current.upload_state === "completed") {
      return ensurePackageJob(deps, {
        themeId: row.theme_id,
        version: row.version,
        now,
      });
    }
    if (current.upload_state === "rejected") {
      throw new UploadError("invalid_state", "upload_rejected");
    }
    throw new UploadError("invalid_state", "upload_transition_failed");
  }

  // Only insert package_jobs / send queue after successful transition.
  return ensurePackageJob(deps, {
    themeId: row.theme_id,
    version: row.version,
    now,
  });
}

async function assertUserCanUpload(
  deps: UploadDeps,
  userId: string,
): Promise<void> {
  const user = await deps.db
    .prepare(
      `SELECT id, upload_status, deletion_status
       FROM users
       WHERE id = ?`,
    )
    .bind(userId)
    .first<{
      id: string;
      upload_status: string;
      deletion_status: string;
    }>();

  if (!user || user.deletion_status !== "active") {
    throw new UploadError("forbidden", "user_not_active");
  }
  if (user.upload_status !== "active") {
    throw new UploadError("forbidden", "upload_suspended");
  }
}

async function signIssued(
  deps: UploadDeps,
  args: {
    uploadId: string;
    key: string;
    contentType: string;
    bytes: number;
    expiresAt: number;
  },
): Promise<IssuedUpload> {
  const signed = await deps.presign.signPut({
    key: args.key,
    contentType: args.contentType,
    uploadId: args.uploadId,
    expectedBytes: args.bytes,
    expiresSeconds: Math.floor(PRESIGN_TTL_MS / 1000),
  });

  return {
    uploadId: args.uploadId,
    key: args.key,
    url: signed.url,
    headers: signed.headers,
    expiresAt: args.expiresAt,
  };
}

/**
 * Insert package job if missing and send queue only for the winning insert.
 * Used for the normal complete path and for completed-without-job recovery.
 */
async function ensurePackageJob(
  deps: UploadDeps,
  args: { themeId: string; version: number; now: number },
): Promise<{ jobId: string | null; queued: boolean }> {
  const idempotencyKey = `package:${args.themeId}:${args.version}`;
  const jobId = crypto.randomUUID();

  const insertResult = await deps.db
    .prepare(
      `INSERT INTO package_jobs (
         id, idempotency_key, theme_id, version, state,
         attempt, max_attempts, available_at,
         lease_owner, lease_expires_at,
         last_error_code, last_error_detail,
         created_at, updated_at, finished_at
       ) VALUES (?, ?, ?, ?, 'queued', 0, 5, ?, NULL, NULL, NULL, NULL, ?, ?, NULL)
       ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(
      jobId,
      idempotencyKey,
      args.themeId,
      args.version,
      args.now,
      args.now,
      args.now,
    )
    .run();

  if (insertResult.meta.changes === 1) {
    await deps.queue.send({ jobId, idempotencyKey });
    return { jobId, queued: true };
  }

  const existingJob = await deps.db
    .prepare(`SELECT id FROM package_jobs WHERE idempotency_key = ?`)
    .bind(idempotencyKey)
    .first<{ id: string }>();

  return { jobId: existingJob?.id ?? null, queued: false };
}

async function rejectAndDelete(
  deps: UploadDeps,
  uploadId: string,
  quarantineKey: string,
  now: number,
): Promise<void> {
  await deps.db
    .prepare(
      `UPDATE source_uploads
       SET state = 'rejected', completed_at = ?
       WHERE id = ? AND state = 'issued'`,
    )
    .bind(now, uploadId)
    .run();
  try {
    await deps.sources.delete(quarantineKey);
  } catch {
    // Object may already be gone.
  }
}
