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
  if (row.visibility !== "draft") {
    throw new UploadError("invalid_state", "theme_not_draft");
  }
  if (row.generation_state !== "awaiting_upload") {
    throw new UploadError("invalid_state", "version_not_awaiting_upload");
  }

  const existing = await deps.db
    .prepare(
      `SELECT id, state, quarantine_key FROM source_uploads
       WHERE theme_id = ? AND version = ?`,
    )
    .bind(input.themeId, input.version)
    .first<{ id: string; state: string; quarantine_key: string }>();

  if (existing && existing.state !== "issued") {
    throw new UploadError("invalid_state", "upload_already_finalized");
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
    await deps.db
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
         WHERE id = ?`,
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
  } else {
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
  }

  const signed = await deps.presign.signPut({
    key,
    contentType: input.contentType,
    uploadId,
    expectedBytes: input.bytes,
    expiresSeconds: Math.floor(PRESIGN_TTL_MS / 1000),
  });

  return {
    uploadId,
    key,
    url: signed.url,
    headers: signed.headers,
    expiresAt,
  };
}

/**
 * Verify the quarantine object and enqueue package generation once.
 * Repeated complete calls are idempotent: queue send only when the
 * package_jobs insert changes one row.
 */
export async function completeUpload(
  deps: UploadDeps,
  input: CompleteUploadInput,
): Promise<{ jobId: string | null; queued: boolean }> {
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

  // Idempotent success path for already-completed uploads.
  if (row.upload_state === "completed") {
    const existingJob = await deps.db
      .prepare(
        `SELECT id FROM package_jobs WHERE idempotency_key = ?`,
      )
      .bind(`package:${row.theme_id}:${row.version}`)
      .first<{ id: string }>();
    return { jobId: existingJob?.id ?? null, queued: false };
  }

  if (row.upload_state !== "issued") {
    throw new UploadError("invalid_state", "upload_not_issued");
  }
  if (row.expires_at < now) {
    await rejectAndDelete(deps, row.upload_id, row.quarantine_key, now);
    throw new UploadError("expired");
  }
  if (row.visibility !== "draft") {
    await rejectAndDelete(deps, row.upload_id, row.quarantine_key, now);
    throw new UploadError("invalid_state", "theme_not_draft");
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

  const idempotencyKey = `package:${row.theme_id}:${row.version}`;
  const jobId = crypto.randomUUID();

  // Mark upload completed and advance generation state.
  await deps.db.batch([
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

  // Idempotent job insert: only the first successful insert enqueues.
  await deps.db
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
      row.theme_id,
      row.version,
      now,
      now,
      now,
    )
    .run();

  // Only the winning insert (our jobId) enqueues the queue message.
  const inserted = await deps.db
    .prepare(`SELECT id FROM package_jobs WHERE id = ?`)
    .bind(jobId)
    .first<{ id: string }>();

  if (inserted) {
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
