import { normalizeCommentBody } from "~/domain/comments/policy";
import { canDownload } from "~/domain/themes/state";

export class CommentError extends Error {
  readonly code:
    | "not_found"
    | "unauthorized"
    | "forbidden"
    | "invalid_body"
    | "theme_not_public"
    | "rate_limited";

  constructor(code: CommentError["code"], message?: string) {
    super(message ?? code);
    this.name = "CommentError";
    this.code = code;
  }
}

export type VisibleComment = {
  id: string;
  themeId: string;
  userId: string | null;
  authorLabel: string;
  body: string | null;
  status: string;
  createdAt: number;
  editedAt: number | null;
  isDeletedMarker: boolean;
};

async function assertPublicTheme(db: D1Database, themeId: string) {
  const theme = await db
    .prepare(
      `SELECT id, visibility, moderation_status, package_status, author_id
       FROM themes WHERE id = ? LIMIT 1`,
    )
    .bind(themeId)
    .first<{
      id: string;
      visibility: string;
      moderation_status: string;
      package_status: string;
      author_id: string;
    }>();

  if (!theme) throw new CommentError("not_found");
  // Comments allowed on public non-removed themes (package readiness not required).
  if (theme.visibility !== "public" || theme.moderation_status === "removed") {
    throw new CommentError("theme_not_public");
  }
  return theme;
}

export async function listVisibleComments(
  db: D1Database,
  themeId: string,
  limit = 50,
): Promise<VisibleComment[]> {
  const rows = await db
    .prepare(
      `SELECT id, theme_id, user_id, author_label, body, status, created_at, edited_at
       FROM comments
       WHERE theme_id = ?
         AND status IN ('visible', 'deleted_by_user')
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(themeId, Math.min(limit, 100))
    .all<{
      id: string;
      theme_id: string;
      user_id: string | null;
      author_label: string;
      body: string | null;
      status: string;
      created_at: number;
      edited_at: number | null;
    }>();

  return rows.results.map((row) => ({
    id: row.id,
    themeId: row.theme_id,
    userId: row.user_id,
    authorLabel: row.author_label,
    body: row.status === "deleted_by_user" ? null : row.body,
    status: row.status,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    isDeletedMarker: row.status === "deleted_by_user",
  }));
}

export async function postComment(
  db: D1Database,
  input: {
    themeId: string;
    userId: string;
    authorLabel: string;
    body: string;
    now?: number;
  },
): Promise<VisibleComment> {
  await assertPublicTheme(db, input.themeId);
  const normalized = normalizeCommentBody(input.body);
  if (!normalized.ok) {
    throw new CommentError("invalid_body", normalized.code);
  }

  const now = input.now ?? Date.now();
  const id = crypto.randomUUID();
  const label = input.authorLabel.trim().slice(0, 80) || "User";

  await db
    .prepare(
      `INSERT INTO comments (
         id, theme_id, user_id, author_label, body, status, created_at, edited_at
       ) VALUES (?, ?, ?, ?, ?, 'visible', ?, NULL)`,
    )
    .bind(id, input.themeId, input.userId, label, normalized.body, now)
    .run();

  return {
    id,
    themeId: input.themeId,
    userId: input.userId,
    authorLabel: label,
    body: normalized.body,
    status: "visible",
    createdAt: now,
    editedAt: null,
    isDeletedMarker: false,
  };
}

/** Self-delete: null body, status deleted_by_user; keep author_label for ordinary deletes. */
export async function deleteOwnComment(
  db: D1Database,
  input: { commentId: string; userId: string; now?: number },
): Promise<void> {
  const now = input.now ?? Date.now();
  const result = await db
    .prepare(
      `UPDATE comments
       SET body = NULL, status = 'deleted_by_user', edited_at = ?
       WHERE id = ? AND user_id = ? AND status = 'visible'`,
    )
    .bind(now, input.commentId, input.userId)
    .run();

  if ((result.meta?.changes ?? 0) !== 1) {
    throw new CommentError("not_found");
  }
}

/** Theme author may hide a visible comment; cannot set removed_by_admin. */
export async function hideCommentByAuthor(
  db: D1Database,
  input: {
    commentId: string;
    authorUserId: string;
    now?: number;
  },
): Promise<void> {
  const comment = await db
    .prepare(
      `SELECT c.id AS id, c.theme_id AS theme_id, c.status AS status, t.author_id AS author_id
       FROM comments c
       INNER JOIN themes t ON t.id = c.theme_id
       WHERE c.id = ?
       LIMIT 1`,
    )
    .bind(input.commentId)
    .first<{
      id: string;
      theme_id: string;
      status: string;
      author_id: string;
    }>();

  if (!comment) throw new CommentError("not_found");
  if (comment.author_id !== input.authorUserId) {
    throw new CommentError("forbidden");
  }
  if (comment.status !== "visible") {
    throw new CommentError("not_found");
  }

  const now = input.now ?? Date.now();
  await db
    .prepare(
      `UPDATE comments
       SET status = 'hidden_by_author', edited_at = ?
       WHERE id = ? AND status = 'visible'`,
    )
    .bind(now, input.commentId)
    .run();
}

export { canDownload };
