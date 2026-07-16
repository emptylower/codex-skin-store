import {
  creatorInputSchema,
  type CreatorInput,
} from "~/domain/themes/creator-input";
import { canChangeSlug } from "~/domain/themes/slug";
import type { ThemeVisibility } from "~/domain/themes/state";

export type CreatorThemeErrorCode =
  | "invalid_input"
  | "upload_suspended"
  | "slug_taken"
  | "slug_immutable"
  | "user_not_found"
  | "forbidden"
  | "not_found"
  | "version_not_ready"
  | "package_head_mismatch"
  | "theme_removed"
  | "invalid_state";

export class CreatorThemeError extends Error {
  readonly code: CreatorThemeErrorCode;

  constructor(code: CreatorThemeErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CreatorThemeError";
    this.code = code;
  }
}

export type CreateDraftDeps = {
  db: D1Database;
  userId: string;
  now?: () => number;
};

export type CreatorLifecycleDeps = {
  db: D1Database;
  /** PACKAGES bucket used for publish-time HEAD verification and artifact reads. */
  packages: Pick<R2Bucket, "head" | "get">;
  now?: () => number;
};

export type DraftTheme = {
  themeId: string;
  versionId: string;
  version: number;
  slug: string;
  visibility: "draft";
  packageStatus: "processing";
  generationState: "awaiting_upload";
};

export type ThemeVersionSummary = {
  version: number;
  generationState: string;
  generationErrorCode: string | null;
  generationErrorDetail: string | null;
  packageKey: string | null;
  payloadDigest: string | null;
  archiveDigest: string | null;
  archiveBytes: number | null;
  publishedAt: number | null;
  previewKey: string | null;
  manifestKey: string | null;
  macosAdapterKey: string | null;
  windowsAdapterKey: string | null;
  installKey: string | null;
  promptKey: string | null;
  creatorInput: CreatorInput | null;
};

export type CreatorThemeDetail = {
  themeId: string;
  slug: string;
  authorId: string;
  sourceLocale: string;
  visibility: ThemeVisibility;
  moderationStatus: string;
  packageStatus: string;
  currentVersion: number | null;
  versions: ThemeVersionSummary[];
};

const ARTIFACT_KEY_COLUMNS = {
  preview: "preview_key",
  manifest: "manifest_key",
  "macos-adapter": "macos_adapter_key",
  "windows-adapter": "windows_adapter_key",
  install: "install_key",
  prompt: "prompt_key",
} as const;

export type CreatorArtifactName = keyof typeof ARTIFACT_KEY_COLUMNS;

export const CREATOR_ARTIFACT_NAMES = Object.keys(
  ARTIFACT_KEY_COLUMNS,
) as CreatorArtifactName[];

/**
 * Create a private draft theme + version 1 awaiting media upload.
 * Inserts theme (draft/clean/processing), version (awaiting_upload),
 * and the approved source-locale translation in one D1 batch.
 */
export async function createDraft(
  deps: CreateDraftDeps,
  rawInput: unknown,
): Promise<DraftTheme> {
  const parsed = creatorInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new CreatorThemeError(
      "invalid_input",
      parsed.error.issues[0]?.message ?? "invalid_input",
    );
  }
  const input: CreatorInput = parsed.data;
  const now = deps.now?.() ?? Date.now();

  const user = await deps.db
    .prepare(
      `SELECT id, upload_status FROM users WHERE id = ? AND deletion_status = 'active'`,
    )
    .bind(deps.userId)
    .first<{ id: string; upload_status: string }>();

  if (!user) {
    throw new CreatorThemeError("user_not_found");
  }
  if (user.upload_status === "suspended") {
    throw new CreatorThemeError("upload_suspended");
  }

  const existingSlug = await deps.db
    .prepare(`SELECT id FROM themes WHERE slug = ?`)
    .bind(input.slug)
    .first<{ id: string }>();
  if (existingSlug) {
    throw new CreatorThemeError("slug_taken");
  }

  const themeId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const translationId = crypto.randomUUID();
  const version = 1;

  // Placeholder until the package builder writes the real neutral manifest.
  const placeholderManifest = JSON.stringify({
    schemaVersion: 1,
    id: themeId,
    slug: input.slug,
    status: "awaiting_upload",
  });

  try {
    await deps.db.batch([
      deps.db
        .prepare(
          `INSERT INTO themes (
             id, author_id, slug, source_locale, current_version,
             visibility, moderation_status, package_status,
             favorites_count, downloads_count, created_at, updated_at
           ) VALUES (?, ?, ?, ?, NULL, 'draft', 'clean', 'processing', 0, 0, ?, ?)`,
        )
        .bind(themeId, deps.userId, input.slug, input.sourceLocale, now, now),
      deps.db
        .prepare(
          `INSERT INTO theme_versions (
             id, theme_id, version, manifest_json, package_key,
             payload_digest, archive_digest, published_at,
             created_at, updated_at, creator_input_json, generation_state
           ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, 'awaiting_upload')`,
        )
        .bind(
          versionId,
          themeId,
          version,
          placeholderManifest,
          now,
          now,
          JSON.stringify(input),
        ),
      deps.db
        .prepare(
          `INSERT INTO theme_translations (
             id, theme_id, locale, name, summary, description,
             translation_status, created_at, updated_at
           ) VALUES (?, ?, ?, ?, '', ?, 'draft', ?, ?)`,
        )
        .bind(
          translationId,
          themeId,
          input.sourceLocale,
          input.name,
          input.description,
          now,
          now,
        ),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unique|constraint/i.test(message)) {
      throw new CreatorThemeError("slug_taken");
    }
    throw error;
  }

  return {
    themeId,
    versionId,
    version,
    slug: input.slug,
    visibility: "draft",
    packageStatus: "processing",
    generationState: "awaiting_upload",
  };
}

type ThemeOwnerRow = {
  id: string;
  author_id: string;
  slug: string;
  source_locale: string;
  current_version: number | null;
  visibility: ThemeVisibility;
  moderation_status: string;
  package_status: string;
};

async function loadOwnedTheme(
  db: D1Database,
  themeId: string,
  userId: string,
): Promise<ThemeOwnerRow> {
  const row = await db
    .prepare(
      `SELECT id, author_id, slug, source_locale, current_version,
              visibility, moderation_status, package_status
       FROM themes WHERE id = ?`,
    )
    .bind(themeId)
    .first<ThemeOwnerRow>();

  if (!row) {
    throw new CreatorThemeError("not_found");
  }
  if (row.author_id !== userId) {
    throw new CreatorThemeError("forbidden");
  }
  return row;
}

function parseCreatorInputJson(raw: string | null): CreatorInput | null {
  if (!raw) return null;
  try {
    const parsed = creatorInputSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseInput(raw: unknown): CreatorInput {
  const parsed = creatorInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CreatorThemeError(
      "invalid_input",
      parsed.error.issues[0]?.message ?? "invalid_input",
    );
  }
  return parsed.data;
}

/**
 * Update draft metadata (including slug while still unpublished).
 * After first publication, slug changes are rejected via canChangeSlug.
 */
export async function updateDraftMetadata(
  deps: CreatorLifecycleDeps | { db: D1Database; now?: () => number },
  args: { userId: string; themeId: string; input: unknown },
): Promise<{ slug: string }> {
  const input = parseInput(args.input);
  const now = deps.now?.() ?? Date.now();
  const theme = await loadOwnedTheme(deps.db, args.themeId, args.userId);

  if (theme.moderation_status === "removed") {
    throw new CreatorThemeError("theme_removed");
  }

  const slugAllowed = canChangeSlug({
    visibility: theme.visibility,
    currentVersion: theme.current_version,
  });

  if (input.slug !== theme.slug) {
    if (!slugAllowed) {
      throw new CreatorThemeError("slug_immutable");
    }
    const collision = await deps.db
      .prepare(`SELECT id FROM themes WHERE slug = ? AND id != ?`)
      .bind(input.slug, theme.id)
      .first<{ id: string }>();
    if (collision) {
      throw new CreatorThemeError("slug_taken");
    }
  }

  // Prefer the latest version for creator_input_json updates.
  const latest = await deps.db
    .prepare(
      `SELECT version FROM theme_versions
       WHERE theme_id = ? ORDER BY version DESC LIMIT 1`,
    )
    .bind(theme.id)
    .first<{ version: number }>();
  if (!latest) {
    throw new CreatorThemeError("not_found");
  }

  try {
    await deps.db.batch([
      deps.db
        .prepare(
          `UPDATE themes
           SET slug = ?, source_locale = ?, updated_at = ?
           WHERE id = ? AND author_id = ?`,
        )
        .bind(input.slug, input.sourceLocale, now, theme.id, args.userId),
      deps.db
        .prepare(
          `UPDATE theme_versions
           SET creator_input_json = ?, updated_at = ?
           WHERE theme_id = ? AND version = ?`,
        )
        .bind(JSON.stringify(input), now, theme.id, latest.version),
      deps.db
        .prepare(
          `UPDATE theme_translations
           SET name = ?, description = ?, updated_at = ?
           WHERE theme_id = ? AND locale = ?`,
        )
        .bind(input.name, input.description, now, theme.id, input.sourceLocale),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unique|constraint/i.test(message)) {
      throw new CreatorThemeError("slug_taken");
    }
    throw error;
  }

  return { slug: input.slug };
}

/**
 * Create the next version from validated creator input.
 * Leaves the currently published version downloadable; new version is awaiting_upload.
 */
export async function createVersion(
  deps: CreatorLifecycleDeps | { db: D1Database; now?: () => number },
  args: { userId: string; themeId: string; input: unknown },
): Promise<{
  versionId: string;
  version: number;
  generationState: "awaiting_upload";
}> {
  const input = parseInput(args.input);
  const now = deps.now?.() ?? Date.now();
  const theme = await loadOwnedTheme(deps.db, args.themeId, args.userId);

  if (theme.moderation_status === "removed") {
    throw new CreatorThemeError("theme_removed");
  }

  const slugAllowed = canChangeSlug({
    visibility: theme.visibility,
    currentVersion: theme.current_version,
  });
  if (input.slug !== theme.slug && !slugAllowed) {
    throw new CreatorThemeError("slug_immutable");
  }

  if (input.slug !== theme.slug) {
    const collision = await deps.db
      .prepare(`SELECT id FROM themes WHERE slug = ? AND id != ?`)
      .bind(input.slug, theme.id)
      .first<{ id: string }>();
    if (collision) {
      throw new CreatorThemeError("slug_taken");
    }
  }

  const maxRow = await deps.db
    .prepare(
      `SELECT COALESCE(MAX(version), 0) AS max_version
       FROM theme_versions WHERE theme_id = ?`,
    )
    .bind(theme.id)
    .first<{ max_version: number }>();
  const nextVersion = (maxRow?.max_version ?? 0) + 1;
  const versionId = crypto.randomUUID();
  const placeholderManifest = JSON.stringify({
    schemaVersion: 1,
    id: theme.id,
    slug: input.slug,
    status: "awaiting_upload",
    version: nextVersion,
  });

  const statements = [
    deps.db
      .prepare(
        `INSERT INTO theme_versions (
           id, theme_id, version, manifest_json, package_key,
           payload_digest, archive_digest, published_at,
           created_at, updated_at, creator_input_json, generation_state
         ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, 'awaiting_upload')`,
      )
      .bind(
        versionId,
        theme.id,
        nextVersion,
        placeholderManifest,
        now,
        now,
        JSON.stringify(input),
      ),
    deps.db
      .prepare(
        `UPDATE theme_translations
         SET name = ?, description = ?, updated_at = ?
         WHERE theme_id = ? AND locale = ?`,
      )
      .bind(input.name, input.description, now, theme.id, theme.source_locale),
    deps.db
      .prepare(`UPDATE themes SET updated_at = ? WHERE id = ?`)
      .bind(now, theme.id),
  ];

  if (input.slug !== theme.slug) {
    statements.push(
      deps.db
        .prepare(
          `UPDATE themes SET slug = ?, updated_at = ? WHERE id = ? AND author_id = ?`,
        )
        .bind(input.slug, now, theme.id, args.userId),
    );
  }

  try {
    await deps.db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unique|constraint/i.test(message)) {
      throw new CreatorThemeError("slug_taken");
    }
    throw error;
  }

  return {
    versionId,
    version: nextVersion,
    generationState: "awaiting_upload",
  };
}

async function assertPackageHead(
  packages: Pick<R2Bucket, "head">,
  packageKey: string,
  payloadDigest: string,
  archiveDigest: string,
): Promise<void> {
  const head = await packages.head(packageKey);
  if (!head) {
    throw new CreatorThemeError("package_head_mismatch");
  }
  const metaPayload =
    head.customMetadata?.["payload-digest"] ??
    head.customMetadata?.payload_digest;
  const metaArchive =
    head.customMetadata?.["archive-digest"] ??
    head.customMetadata?.archive_digest;
  if (metaPayload !== payloadDigest || metaArchive !== archiveDigest) {
    throw new CreatorThemeError("package_head_mismatch");
  }
}

/**
 * Atomically publish a ready version as the theme's current public package.
 * Requires package HEAD metadata to match recorded digests before the D1 batch.
 */
export async function publishTheme(
  deps: CreatorLifecycleDeps,
  args: { userId: string; themeId: string; version: number },
): Promise<{
  visibility: "public";
  currentVersion: number;
  packageStatus: "ready";
}> {
  const now = deps.now?.() ?? Date.now();
  const theme = await loadOwnedTheme(deps.db, args.themeId, args.userId);

  if (theme.moderation_status === "removed") {
    throw new CreatorThemeError("theme_removed");
  }
  if (theme.visibility === "hidden") {
    throw new CreatorThemeError("invalid_state", "theme_hidden");
  }

  const versionRow = await deps.db
    .prepare(
      `SELECT version, generation_state, package_key, payload_digest, archive_digest
       FROM theme_versions
       WHERE theme_id = ? AND version = ?`,
    )
    .bind(args.themeId, args.version)
    .first<{
      version: number;
      generation_state: string;
      package_key: string | null;
      payload_digest: string | null;
      archive_digest: string | null;
    }>();

  if (!versionRow) {
    throw new CreatorThemeError("not_found");
  }
  if (
    versionRow.generation_state !== "ready" ||
    !versionRow.package_key ||
    !versionRow.payload_digest ||
    !versionRow.archive_digest
  ) {
    throw new CreatorThemeError("version_not_ready");
  }

  await assertPackageHead(
    deps.packages,
    versionRow.package_key,
    versionRow.payload_digest,
    versionRow.archive_digest,
  );

  const results = await deps.db.batch([
    deps.db
      .prepare(
        `UPDATE themes
         SET visibility = 'public',
             current_version = ?,
             package_status = 'ready',
             updated_at = ?
         WHERE id = ?
           AND author_id = ?
           AND moderation_status != 'removed'
           AND EXISTS (
             SELECT 1 FROM theme_versions v
             WHERE v.theme_id = themes.id
               AND v.version = ?
               AND v.generation_state = 'ready'
               AND v.package_key IS NOT NULL
               AND v.archive_digest IS NOT NULL
           )`,
      )
      .bind(args.version, now, args.themeId, args.userId, args.version),
    deps.db
      .prepare(
        `UPDATE theme_versions
         SET published_at = COALESCE(published_at, ?),
             updated_at = ?
         WHERE theme_id = ?
           AND version = ?
           AND generation_state = 'ready'
           AND package_key IS NOT NULL
           AND archive_digest IS NOT NULL`,
      )
      .bind(now, now, args.themeId, args.version),
  ]);

  const themeChanges = results[0]?.meta?.changes ?? 0;
  if (themeChanges !== 1) {
    throw new CreatorThemeError("version_not_ready");
  }

  return {
    visibility: "public",
    currentVersion: args.version,
    packageStatus: "ready",
  };
}

/**
 * Owner-only unlist: public|unlisted -> unlisted.
 * Preserves versions, package readiness, and moderation records.
 */
export async function unlistTheme(
  deps: { db: D1Database; now?: () => number },
  args: { userId: string; themeId: string },
): Promise<{ visibility: "unlisted" }> {
  const now = deps.now?.() ?? Date.now();
  const theme = await loadOwnedTheme(deps.db, args.themeId, args.userId);

  if (theme.moderation_status === "removed") {
    throw new CreatorThemeError("theme_removed");
  }
  if (theme.visibility === "hidden" || theme.visibility === "draft") {
    throw new CreatorThemeError("invalid_state");
  }
  if (theme.visibility !== "public" && theme.visibility !== "unlisted") {
    throw new CreatorThemeError("invalid_state");
  }

  const result = await deps.db
    .prepare(
      `UPDATE themes
       SET visibility = 'unlisted', updated_at = ?
       WHERE id = ?
         AND author_id = ?
         AND moderation_status != 'removed'
         AND visibility IN ('public', 'unlisted')`,
    )
    .bind(now, args.themeId, args.userId)
    .run();

  if ((result.meta?.changes ?? 0) !== 1) {
    throw new CreatorThemeError("invalid_state");
  }

  return { visibility: "unlisted" };
}

/**
 * Reset a failed version back to awaiting_upload so the creator can re-upload.
 */
export async function retryFailedVersion(
  deps: { db: D1Database; now?: () => number },
  args: { userId: string; themeId: string; version: number },
): Promise<{ version: number; generationState: "awaiting_upload" }> {
  const now = deps.now?.() ?? Date.now();
  const theme = await loadOwnedTheme(deps.db, args.themeId, args.userId);

  if (theme.moderation_status === "removed") {
    throw new CreatorThemeError("theme_removed");
  }

  const versionRow = await deps.db
    .prepare(
      `SELECT generation_state FROM theme_versions
       WHERE theme_id = ? AND version = ?`,
    )
    .bind(args.themeId, args.version)
    .first<{ generation_state: string }>();

  if (!versionRow) {
    throw new CreatorThemeError("not_found");
  }
  if (versionRow.generation_state !== "failed") {
    throw new CreatorThemeError("invalid_state", "version_not_failed");
  }

  await deps.db.batch([
    deps.db
      .prepare(
        `UPDATE theme_versions
         SET generation_state = 'awaiting_upload',
             generation_error_code = NULL,
             generation_error_detail = NULL,
             package_key = NULL,
             payload_digest = NULL,
             archive_digest = NULL,
             archive_bytes = NULL,
             updated_at = ?
         WHERE theme_id = ? AND version = ? AND generation_state = 'failed'`,
      )
      .bind(now, args.themeId, args.version),
    deps.db
      .prepare(`DELETE FROM source_uploads WHERE theme_id = ? AND version = ?`)
      .bind(args.themeId, args.version),
    deps.db
      .prepare(
        `UPDATE themes
         SET package_status = CASE
           WHEN current_version IS NULL THEN 'processing'
           ELSE package_status
         END,
         updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, args.themeId),
  ]);

  return { version: args.version, generationState: "awaiting_upload" };
}

export async function getCreatorThemeBySlug(
  db: D1Database,
  args: { userId: string; slug: string },
): Promise<CreatorThemeDetail> {
  const theme = await db
    .prepare(
      `SELECT id, author_id, slug, source_locale, current_version,
              visibility, moderation_status, package_status
       FROM themes WHERE slug = ?`,
    )
    .bind(args.slug)
    .first<ThemeOwnerRow>();

  if (!theme) {
    throw new CreatorThemeError("not_found");
  }
  if (theme.author_id !== args.userId) {
    throw new CreatorThemeError("forbidden");
  }

  const versions = await db
    .prepare(
      `SELECT version, generation_state, generation_error_code, generation_error_detail,
              package_key, payload_digest, archive_digest, archive_bytes, published_at,
              preview_key, manifest_key, macos_adapter_key, windows_adapter_key,
              install_key, prompt_key, creator_input_json
       FROM theme_versions
       WHERE theme_id = ?
       ORDER BY version DESC`,
    )
    .bind(theme.id)
    .all<{
      version: number;
      generation_state: string;
      generation_error_code: string | null;
      generation_error_detail: string | null;
      package_key: string | null;
      payload_digest: string | null;
      archive_digest: string | null;
      archive_bytes: number | null;
      published_at: number | null;
      preview_key: string | null;
      manifest_key: string | null;
      macos_adapter_key: string | null;
      windows_adapter_key: string | null;
      install_key: string | null;
      prompt_key: string | null;
      creator_input_json: string | null;
    }>();

  return {
    themeId: theme.id,
    slug: theme.slug,
    authorId: theme.author_id,
    sourceLocale: theme.source_locale,
    visibility: theme.visibility,
    moderationStatus: theme.moderation_status,
    packageStatus: theme.package_status,
    currentVersion: theme.current_version,
    versions: (versions.results ?? []).map((v) => ({
      version: v.version,
      generationState: v.generation_state,
      generationErrorCode: v.generation_error_code,
      generationErrorDetail: v.generation_error_detail,
      packageKey: v.package_key,
      payloadDigest: v.payload_digest,
      archiveDigest: v.archive_digest,
      archiveBytes: v.archive_bytes,
      publishedAt: v.published_at,
      previewKey: v.preview_key,
      manifestKey: v.manifest_key,
      macosAdapterKey: v.macos_adapter_key,
      windowsAdapterKey: v.windows_adapter_key,
      installKey: v.install_key,
      promptKey: v.prompt_key,
      creatorInput: parseCreatorInputJson(v.creator_input_json),
    })),
  };
}

export type CreatorArtifactResult = {
  key: string;
  body: ReadableStream | ArrayBuffer | null;
  contentType: string;
  filename: string;
};

const ARTIFACT_CONTENT_TYPES: Record<CreatorArtifactName, string> = {
  preview: "image/jpeg",
  manifest: "application/json",
  "macos-adapter": "application/json",
  "windows-adapter": "application/json",
  install: "text/markdown; charset=utf-8",
  prompt: "text/markdown; charset=utf-8",
};

const ARTIFACT_FILENAMES: Record<CreatorArtifactName, string> = {
  preview: "preview.jpg",
  manifest: "manifest.json",
  "macos-adapter": "macos-theme.json",
  "windows-adapter": "windows-theme.json",
  install: "INSTALL.md",
  prompt: "install-prompt.md",
};

/**
 * Author-only artifact read. Allowlists preview|manifest|adapters|install|prompt.
 * Never accepts raw R2 keys from the client.
 */
export async function getCreatorArtifact(
  deps: CreatorLifecycleDeps,
  args: {
    userId: string;
    themeId: string;
    version: number;
    artifact: string;
  },
): Promise<{
  body: R2ObjectBody;
  contentType: string;
  filename: string;
  cacheControl: "private, no-store";
}> {
  if (!(args.artifact in ARTIFACT_KEY_COLUMNS)) {
    throw new CreatorThemeError("not_found");
  }
  const artifact = args.artifact as CreatorArtifactName;
  const column = ARTIFACT_KEY_COLUMNS[artifact];

  const row = await deps.db
    .prepare(
      `SELECT t.author_id AS author_id, v.${column} AS artifact_key
       FROM themes t
       INNER JOIN theme_versions v
         ON v.theme_id = t.id AND v.version = ?
       WHERE t.id = ?`,
    )
    .bind(args.version, args.themeId)
    .first<{ author_id: string; artifact_key: string | null }>();

  if (!row) {
    throw new CreatorThemeError("not_found");
  }
  if (row.author_id !== args.userId) {
    throw new CreatorThemeError("forbidden");
  }
  if (!row.artifact_key) {
    throw new CreatorThemeError("not_found");
  }

  const object = await deps.packages.get(row.artifact_key);
  if (!object) {
    throw new CreatorThemeError("not_found");
  }

  return {
    body: object,
    contentType:
      object.httpMetadata?.contentType ?? ARTIFACT_CONTENT_TYPES[artifact],
    filename: ARTIFACT_FILENAMES[artifact],
    cacheControl: "private, no-store",
  };
}
