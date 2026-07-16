export class DeleteAccountError extends Error {
  readonly code:
    | "unauthorized"
    | "confirmation_mismatch"
    | "auth_cleanup_pending"
    | "not_found";

  constructor(code: DeleteAccountError["code"], message?: string) {
    super(message ?? code);
    this.name = "DeleteAccountError";
    this.code = code;
  }
}

export const DELETE_CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";

export type DeleteAccountResult = {
  status: "deleted" | "auth_cleanup_pending";
};

/**
 * Remove oauth/sessions/favorites; anonymize comments/events; unlist owned themes.
 * Better Auth cleanup is best-effort; failures mark deletion_status for retry.
 */
export async function deleteAccount(
  db: D1Database,
  input: {
    userId: string;
    confirmation: string;
    now?: number;
    /** Optional Better Auth cleanup hook. */
    authCleanup?: () => Promise<void>;
  },
): Promise<DeleteAccountResult> {
  if (input.confirmation.trim() !== DELETE_CONFIRMATION_PHRASE) {
    throw new DeleteAccountError("confirmation_mismatch");
  }

  const now = input.now ?? Date.now();
  const user = await db
    .prepare(`SELECT id, deletion_status FROM users WHERE id = ? LIMIT 1`)
    .bind(input.userId)
    .first<{ id: string; deletion_status: string }>();

  if (!user) throw new DeleteAccountError("not_found");

  // App-owned rows in a batch.
  await db.batch([
    // Favorites removed entirely.
    db.prepare(`DELETE FROM favorites WHERE user_id = ?`).bind(input.userId),
    // Comments anonymized; body retained; author_label becomes Deleted user.
    db
      .prepare(
        `UPDATE comments
         SET user_id = NULL, author_label = 'Deleted user', edited_at = ?
         WHERE user_id = ?`,
      )
      .bind(now, input.userId),
    // Events lose user_id.
    db
      .prepare(`UPDATE engagement_events SET user_id = NULL WHERE user_id = ?`)
      .bind(input.userId),
    // Owned themes become unlisted (aggregate/moderation records remain).
    db
      .prepare(
        `UPDATE themes
         SET visibility = 'unlisted', updated_at = ?
         WHERE author_id = ? AND visibility != 'hidden'`,
      )
      .bind(now, input.userId),
    // OAuth accounts + sessions removed.
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(input.userId),
    db.prepare(`DELETE FROM accounts WHERE user_id = ?`).bind(input.userId),
    // Clear personal profile fields; mark deleted.
    db
      .prepare(
        `UPDATE users
         SET email = NULL,
             email_verified = 0,
             display_name = 'Deleted user',
             avatar_url = NULL,
             bio = '',
             deletion_status = 'deleted',
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, input.userId),
  ]);

  if (input.authCleanup) {
    try {
      await input.authCleanup();
    } catch {
      await db
        .prepare(
          `UPDATE users SET deletion_status = 'auth_cleanup_pending', updated_at = ? WHERE id = ?`,
        )
        .bind(now, input.userId)
        .run();
      return { status: "auth_cleanup_pending" };
    }
  }

  return { status: "deleted" };
}

/** Retry auth cleanup for pending deletions (scheduled). */
export async function retryPendingAuthCleanups(
  db: D1Database,
  cleanup: (userId: string) => Promise<void>,
  now = Date.now(),
): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT id FROM users WHERE deletion_status = 'auth_cleanup_pending' LIMIT 20`,
    )
    .all<{ id: string }>();

  let fixed = 0;
  for (const row of rows.results) {
    try {
      await cleanup(row.id);
      await db
        .prepare(
          `UPDATE users SET deletion_status = 'deleted', updated_at = ? WHERE id = ?`,
        )
        .bind(now, row.id)
        .run();
      fixed += 1;
    } catch {
      // leave pending
    }
  }
  return fixed;
}
