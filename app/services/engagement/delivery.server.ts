import { canDownload } from "~/domain/themes/state";
import { recordEngagementEvent } from "~/services/engagement/events.server";

export class DeliveryError extends Error {
  readonly code:
    | "not_found"
    | "unauthorized"
    | "not_ready"
    | "package_missing";

  constructor(code: DeliveryError["code"], message?: string) {
    super(message ?? code);
    this.name = "DeliveryError";
    this.code = code;
  }
}

export type AuthorizedPackage = {
  themeId: string;
  slug: string;
  version: number;
  packageKey: string;
  archiveDigest: string | null;
  archiveBytes: number | null;
};

type ThemeDeliveryRow = {
  id: string;
  slug: string;
  visibility: string;
  moderation_status: string;
  package_status: string;
  current_version: number | null;
  package_key: string | null;
  archive_digest: string | null;
  archive_bytes: number | null;
  version: number | null;
  prompt_key: string | null;
  install_key: string | null;
};

async function loadBySlug(
  db: D1Database,
  slug: string,
): Promise<ThemeDeliveryRow | null> {
  return db
    .prepare(
      `SELECT t.id AS id, t.slug AS slug, t.visibility AS visibility,
              t.moderation_status AS moderation_status,
              t.package_status AS package_status,
              t.current_version AS current_version,
              v.package_key AS package_key,
              v.archive_digest AS archive_digest,
              v.archive_bytes AS archive_bytes,
              v.version AS version,
              v.prompt_key AS prompt_key,
              v.install_key AS install_key
       FROM themes t
       LEFT JOIN theme_versions v
         ON v.theme_id = t.id AND v.version = t.current_version
       WHERE t.slug = ?
       LIMIT 1`,
    )
    .bind(slug)
    .first<ThemeDeliveryRow>();
}

async function loadById(
  db: D1Database,
  themeId: string,
): Promise<ThemeDeliveryRow | null> {
  return db
    .prepare(
      `SELECT t.id AS id, t.slug AS slug, t.visibility AS visibility,
              t.moderation_status AS moderation_status,
              t.package_status AS package_status,
              t.current_version AS current_version,
              v.package_key AS package_key,
              v.archive_digest AS archive_digest,
              v.archive_bytes AS archive_bytes,
              v.version AS version,
              v.prompt_key AS prompt_key,
              v.install_key AS install_key
       FROM themes t
       LEFT JOIN theme_versions v
         ON v.theme_id = t.id AND v.version = t.current_version
       WHERE t.id = ?
       LIMIT 1`,
    )
    .bind(themeId)
    .first<ThemeDeliveryRow>();
}

function assertDeliverable(row: ThemeDeliveryRow | null): asserts row is ThemeDeliveryRow {
  if (!row) throw new DeliveryError("not_found");
  const ok = canDownload({
    visibility: row.visibility as "public",
    moderationStatus: row.moderation_status as "clean",
    packageStatus: row.package_status as "ready",
  });
  if (!ok) throw new DeliveryError("not_ready");
  if (
    row.current_version == null ||
    row.version == null ||
    row.version !== row.current_version
  ) {
    throw new DeliveryError("not_ready");
  }
}

/**
 * Authorize current public+clean+ready package. Key always comes from D1.
 */
export async function authorizePackageDownload(
  db: D1Database,
  input: { slug?: string; themeId?: string },
): Promise<AuthorizedPackage> {
  const row = input.slug
    ? await loadBySlug(db, input.slug)
    : input.themeId
      ? await loadById(db, input.themeId)
      : null;

  assertDeliverable(row);
  if (!row.package_key) throw new DeliveryError("package_missing");

  return {
    themeId: row.id,
    slug: row.slug,
    version: row.version!,
    packageKey: row.package_key,
    archiveDigest: row.archive_digest,
    archiveBytes: row.archive_bytes,
  };
}

export type AuthorizedPrompt = {
  themeId: string;
  slug: string;
  version: number;
  /** Prefer prompt_key object text; install_key is fallback path. */
  promptKey: string | null;
  installKey: string | null;
};

export async function authorizePromptAccess(
  db: D1Database,
  input: { slug?: string; themeId?: string },
): Promise<AuthorizedPrompt> {
  const row = input.slug
    ? await loadBySlug(db, input.slug)
    : input.themeId
      ? await loadById(db, input.themeId)
      : null;

  assertDeliverable(row);

  return {
    themeId: row.id,
    slug: row.slug,
    version: row.version!,
    promptKey: row.prompt_key,
    installKey: row.install_key,
  };
}

export async function markDownloadEvent(
  db: D1Database,
  input: {
    userId: string;
    themeId: string;
    themeVersion: number;
    platform?: string | null;
    now?: number;
  },
): Promise<void> {
  await recordEngagementEvent(db, {
    userId: input.userId,
    themeId: input.themeId,
    themeVersion: input.themeVersion,
    eventType: "download",
    platform: input.platform,
    now: input.now,
  });
  // Best-effort live counter bump; scheduled reconcile is source of truth.
  await db
    .prepare(
      `UPDATE themes SET downloads_count = downloads_count + 1, updated_at = ? WHERE id = ?`,
    )
    .bind(input.now ?? Date.now(), input.themeId)
    .run();
}

export async function markPromptCopyEvent(
  db: D1Database,
  input: {
    userId: string;
    themeId: string;
    themeVersion: number;
    platform?: string | null;
    now?: number;
  },
): Promise<void> {
  await recordEngagementEvent(db, {
    userId: input.userId,
    themeId: input.themeId,
    themeVersion: input.themeVersion,
    eventType: "prompt_copy",
    platform: input.platform,
    now: input.now,
  });
}
