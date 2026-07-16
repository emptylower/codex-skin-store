export type ProfileUpdate = {
  handle: string;
  displayName: string;
  bio: string;
};

export type ProfileErrorCode =
  | "handle_invalid"
  | "handle_taken"
  | "display_name_invalid"
  | "bio_invalid"
  | "user_not_found";

export class ProfileError extends Error {
  readonly code: ProfileErrorCode;

  constructor(code: ProfileErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ProfileError";
    this.code = code;
  }
}

/**
 * Normalize public handles to lowercase ASCII hyphens, 3-32 characters.
 * Spaces and underscores collapse to a single hyphen.
 */
export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertHandle(handle: string): string {
  const normalized = normalizeHandle(handle);
  if (normalized.length < 3 || normalized.length > 32) {
    throw new ProfileError("handle_invalid", "Handle must be 3-32 characters");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new ProfileError("handle_invalid", "Handle format is invalid");
  }
  return normalized;
}

function assertDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new ProfileError(
      "display_name_invalid",
      "Display name must be 1-80 characters",
    );
  }
  return trimmed;
}

function assertBio(bio: string): string {
  if (bio.length > 280) {
    throw new ProfileError("bio_invalid", "Bio must be at most 280 characters");
  }
  return bio;
}

export async function updateProfile(
  db: D1Database,
  userId: string,
  input: ProfileUpdate,
) {
  const handle = assertHandle(input.handle);
  const displayName = assertDisplayName(input.displayName);
  const bio = assertBio(input.bio);
  const now = Date.now();

  const existing = await db
    .prepare(`SELECT id FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ id: string }>();
  if (!existing) {
    throw new ProfileError("user_not_found");
  }

  const taken = await db
    .prepare(`SELECT id FROM users WHERE handle = ? AND id != ?`)
    .bind(handle, userId)
    .first<{ id: string }>();
  if (taken) {
    throw new ProfileError("handle_taken");
  }

  try {
    await db
      .prepare(
        `UPDATE users
         SET handle = ?, display_name = ?, bio = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(handle, displayName, bio, now, userId)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unique|constraint/i.test(message)) {
      throw new ProfileError("handle_taken");
    }
    throw error;
  }

  return { userId, handle, displayName, bio };
}

export async function getProfile(db: D1Database, userId: string) {
  const row = await db
    .prepare(
      `SELECT id, handle, display_name, bio, avatar_url, role, upload_status, email
       FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<{
      id: string;
      handle: string;
      display_name: string;
      bio: string;
      avatar_url: string | null;
      role: string;
      upload_status: string;
      email: string | null;
    }>();

  if (!row) return null;

  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    role: row.role,
    uploadStatus: row.upload_status,
    email: row.email,
  };
}
