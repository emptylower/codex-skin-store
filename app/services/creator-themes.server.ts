import {
  creatorInputSchema,
  type CreatorInput,
} from "~/domain/themes/creator-input";

export type CreatorThemeErrorCode =
  | "invalid_input"
  | "upload_suspended"
  | "slug_taken"
  | "user_not_found"
  | "forbidden"
  | "not_found";

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

export type DraftTheme = {
  themeId: string;
  versionId: string;
  version: number;
  slug: string;
  visibility: "draft";
  packageStatus: "processing";
  generationState: "awaiting_upload";
};

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
        .bind(
          themeId,
          deps.userId,
          input.slug,
          input.sourceLocale,
          now,
          now,
        ),
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
