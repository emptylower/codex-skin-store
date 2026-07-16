import {
  canPerform,
  type ModerationAction,
  type UserRole,
} from "~/domain/moderation/policy";
import { appendAuditAction, type AuditActionRow } from "./audit.server";

export class AdminError extends Error {
  readonly code:
    | "forbidden"
    | "not_found"
    | "invalid"
    | "conflict"
    | "unauthorized";

  constructor(code: AdminError["code"], message?: string) {
    super(message ?? code);
    this.name = "AdminError";
    this.code = code;
  }
}

export type ActorContext = {
  id: string;
  role: UserRole | string;
};

type ThemeState = {
  id: string;
  visibility: string;
  moderation_status: string;
};

type CommentState = {
  id: string;
  status: string;
};

type UserState = {
  id: string;
  role: string;
  upload_status: string;
};

type ReportState = {
  id: string;
  status: string;
  target_type: string;
  target_id: string;
};

async function loadActorRole(
  db: D1Database,
  actorId: string,
): Promise<UserRole | string | null> {
  const row = await db
    .prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`)
    .bind(actorId)
    .first<{ role: string }>();
  return row?.role ?? null;
}

async function requireActor(
  db: D1Database,
  actorId: string,
  action: ModerationAction,
): Promise<ActorContext> {
  const role = await loadActorRole(db, actorId);
  if (!role) throw new AdminError("unauthorized");
  if (!canPerform(role, action)) throw new AdminError("forbidden");
  return { id: actorId, role };
}

function requireReason(reason: string | undefined | null): string {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 3) throw new AdminError("invalid", "reason_required");
  return trimmed;
}

export async function listOpenReports(
  db: D1Database,
  input: {
    actorId: string;
    status?: "open" | "dismissed" | "resolved";
    targetType?: "theme" | "comment" | "user";
    reason?: string;
    limit?: number;
    cursor?: number;
  },
) {
  await requireActor(db, input.actorId, "report.list");
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const cursor = input.cursor ?? Number.MAX_SAFE_INTEGER;
  const status = input.status ?? "open";

  let query = `SELECT id, reporter_id AS reporterId, target_type AS targetType,
                      target_id AS targetId, reason, details, status,
                      resolved_by AS resolvedBy, created_at AS createdAt,
                      resolved_at AS resolvedAt
               FROM reports
               WHERE status = ? AND created_at < ?`;
  const binds: Array<string | number> = [status, cursor];

  if (input.targetType) {
    query += ` AND target_type = ?`;
    binds.push(input.targetType);
  }
  if (input.reason) {
    query += ` AND reason = ?`;
    binds.push(input.reason);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  binds.push(limit);

  const result = await db
    .prepare(query)
    .bind(...binds)
    .all();
  return result.results ?? [];
}

export async function resolveReport(
  db: D1Database,
  input: {
    actorId: string;
    reportId: string;
    outcome: "resolved" | "dismissed";
    reason: string;
    now?: number;
  },
): Promise<AuditActionRow> {
  const action =
    input.outcome === "dismissed" ? "report.dismiss" : "report.resolve";
  const actor = await requireActor(db, input.actorId, action);
  const reason = requireReason(input.reason);
  const now = input.now ?? Date.now();

  const report = await db
    .prepare(
      `SELECT id, status, target_type, target_id FROM reports WHERE id = ? LIMIT 1`,
    )
    .bind(input.reportId)
    .first<ReportState>();
  if (!report) throw new AdminError("not_found");
  if (report.status !== "open") throw new AdminError("conflict", "not_open");

  const before = { status: report.status };
  const after = {
    status: input.outcome,
    resolvedBy: actor.id,
    resolvedAt: now,
  };

  const auditId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `UPDATE reports
         SET status = ?, resolved_by = ?, resolved_at = ?
         WHERE id = ? AND status = 'open'`,
      )
      .bind(input.outcome, actor.id, now, input.reportId),
    db
      .prepare(
        `INSERT INTO moderation_actions (
           id, actor_id, target_type, target_id, action, reason,
           before_json, after_json, created_at
         ) VALUES (?, ?, 'report', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        actor.id,
        input.reportId,
        action,
        reason,
        JSON.stringify(before),
        JSON.stringify(after),
        now,
      ),
  ]);

  return {
    id: auditId,
    actorId: actor.id,
    targetType: "report",
    targetId: input.reportId,
    action,
    reason,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
    createdAt: now,
  };
}

export async function removeTheme(
  db: D1Database,
  input: { actorId: string; themeId: string; reason: string; now?: number },
): Promise<AuditActionRow> {
  const actor = await requireActor(db, input.actorId, "theme.remove");
  const reason = requireReason(input.reason);
  const now = input.now ?? Date.now();

  const theme = await db
    .prepare(
      `SELECT id, visibility, moderation_status FROM themes WHERE id = ? LIMIT 1`,
    )
    .bind(input.themeId)
    .first<ThemeState>();
  if (!theme) throw new AdminError("not_found");

  const before = {
    visibility: theme.visibility,
    moderationStatus: theme.moderation_status,
  };
  const after = {
    visibility: "hidden",
    moderationStatus: "removed",
  };

  const auditId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `UPDATE themes
         SET visibility = 'hidden', moderation_status = 'removed', updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, input.themeId),
    db
      .prepare(
        `INSERT INTO moderation_actions (
           id, actor_id, target_type, target_id, action, reason,
           before_json, after_json, created_at
         ) VALUES (?, ?, 'theme', ?, 'theme.remove', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        actor.id,
        input.themeId,
        reason,
        JSON.stringify(before),
        JSON.stringify(after),
        now,
      ),
  ]);

  return {
    id: auditId,
    actorId: actor.id,
    targetType: "theme",
    targetId: input.themeId,
    action: "theme.remove",
    reason,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
    createdAt: now,
  };
}

/**
 * Restore theme to the prior safe state recorded on the latest remove action.
 * Does not blindly set public/clean if the prior state was unlisted/flagged.
 */
export async function restoreTheme(
  db: D1Database,
  input: { actorId: string; themeId: string; reason: string; now?: number },
): Promise<AuditActionRow> {
  const actor = await requireActor(db, input.actorId, "theme.restore");
  const reason = requireReason(input.reason);
  const now = input.now ?? Date.now();

  const theme = await db
    .prepare(
      `SELECT id, visibility, moderation_status FROM themes WHERE id = ? LIMIT 1`,
    )
    .bind(input.themeId)
    .first<ThemeState>();
  if (!theme) throw new AdminError("not_found");

  const lastRemove = await db
    .prepare(
      `SELECT before_json FROM moderation_actions
       WHERE target_type = 'theme' AND target_id = ? AND action = 'theme.remove'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(input.themeId)
    .first<{ before_json: string }>();

  let restoreVisibility = "unlisted";
  let restoreModeration = "clean";
  if (lastRemove?.before_json) {
    try {
      const prior = JSON.parse(lastRemove.before_json) as {
        visibility?: string;
        moderationStatus?: string;
      };
      if (prior.visibility && prior.visibility !== "hidden") {
        restoreVisibility = prior.visibility;
      }
      if (prior.moderationStatus && prior.moderationStatus !== "removed") {
        restoreModeration = prior.moderationStatus;
      }
    } catch {
      // fall back to safe defaults
    }
  }

  const before = {
    visibility: theme.visibility,
    moderationStatus: theme.moderation_status,
  };
  const after = {
    visibility: restoreVisibility,
    moderationStatus: restoreModeration,
  };

  const auditId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `UPDATE themes
         SET visibility = ?, moderation_status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(restoreVisibility, restoreModeration, now, input.themeId),
    db
      .prepare(
        `INSERT INTO moderation_actions (
           id, actor_id, target_type, target_id, action, reason,
           before_json, after_json, created_at
         ) VALUES (?, ?, 'theme', ?, 'theme.restore', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        actor.id,
        input.themeId,
        reason,
        JSON.stringify(before),
        JSON.stringify(after),
        now,
      ),
  ]);

  return {
    id: auditId,
    actorId: actor.id,
    targetType: "theme",
    targetId: input.themeId,
    action: "theme.restore",
    reason,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
    createdAt: now,
  };
}

export async function removeComment(
  db: D1Database,
  input: { actorId: string; commentId: string; reason: string; now?: number },
): Promise<AuditActionRow> {
  const actor = await requireActor(db, input.actorId, "comment.remove");
  const reason = requireReason(input.reason);
  const now = input.now ?? Date.now();

  const comment = await db
    .prepare(`SELECT id, status FROM comments WHERE id = ? LIMIT 1`)
    .bind(input.commentId)
    .first<CommentState>();
  if (!comment) throw new AdminError("not_found");

  const before = { status: comment.status };
  const after = { status: "removed_by_admin" };

  const auditId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(`UPDATE comments SET status = 'removed_by_admin' WHERE id = ?`)
      .bind(input.commentId),
    db
      .prepare(
        `INSERT INTO moderation_actions (
           id, actor_id, target_type, target_id, action, reason,
           before_json, after_json, created_at
         ) VALUES (?, ?, 'comment', ?, 'comment.remove', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        actor.id,
        input.commentId,
        reason,
        JSON.stringify(before),
        JSON.stringify(after),
        now,
      ),
  ]);

  return {
    id: auditId,
    actorId: actor.id,
    targetType: "comment",
    targetId: input.commentId,
    action: "comment.remove",
    reason,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
    createdAt: now,
  };
}

export async function restoreComment(
  db: D1Database,
  input: { actorId: string; commentId: string; reason: string; now?: number },
): Promise<AuditActionRow> {
  const actor = await requireActor(db, input.actorId, "comment.restore");
  const reason = requireReason(input.reason);
  const now = input.now ?? Date.now();

  const comment = await db
    .prepare(`SELECT id, status FROM comments WHERE id = ? LIMIT 1`)
    .bind(input.commentId)
    .first<CommentState>();
  if (!comment) throw new AdminError("not_found");

  const lastRemove = await db
    .prepare(
      `SELECT before_json FROM moderation_actions
       WHERE target_type = 'comment' AND target_id = ? AND action = 'comment.remove'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(input.commentId)
    .first<{ before_json: string }>();

  let restoreStatus = "visible";
  if (lastRemove?.before_json) {
    try {
      const prior = JSON.parse(lastRemove.before_json) as { status?: string };
      if (
        prior.status &&
        prior.status !== "removed_by_admin" &&
        prior.status !== "deleted_by_user"
      ) {
        restoreStatus = prior.status;
      }
    } catch {
      // default visible
    }
  }

  const before = { status: comment.status };
  const after = { status: restoreStatus };

  const auditId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(`UPDATE comments SET status = ? WHERE id = ?`)
      .bind(restoreStatus, input.commentId),
    db
      .prepare(
        `INSERT INTO moderation_actions (
           id, actor_id, target_type, target_id, action, reason,
           before_json, after_json, created_at
         ) VALUES (?, ?, 'comment', ?, 'comment.restore', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        actor.id,
        input.commentId,
        reason,
        JSON.stringify(before),
        JSON.stringify(after),
        now,
      ),
  ]);

  return {
    id: auditId,
    actorId: actor.id,
    targetType: "comment",
    targetId: input.commentId,
    action: "comment.restore",
    reason,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
    createdAt: now,
  };
}

export async function suspendUploads(
  db: D1Database,
  input: { actorId: string; userId: string; reason: string; now?: number },
): Promise<AuditActionRow> {
  const actor = await requireActor(db, input.actorId, "user.suspend_uploads");
  const reason = requireReason(input.reason);
  const now = input.now ?? Date.now();

  const user = await db
    .prepare(`SELECT id, role, upload_status FROM users WHERE id = ? LIMIT 1`)
    .bind(input.userId)
    .first<UserState>();
  if (!user) throw new AdminError("not_found");

  const before = { uploadStatus: user.upload_status };
  const after = { uploadStatus: "suspended" };

  const auditId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `UPDATE users SET upload_status = 'suspended', updated_at = ? WHERE id = ?`,
      )
      .bind(now, input.userId),
    db
      .prepare(
        `INSERT INTO moderation_actions (
           id, actor_id, target_type, target_id, action, reason,
           before_json, after_json, created_at
         ) VALUES (?, ?, 'user', ?, 'user.suspend_uploads', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        actor.id,
        input.userId,
        reason,
        JSON.stringify(before),
        JSON.stringify(after),
        now,
      ),
  ]);

  return {
    id: auditId,
    actorId: actor.id,
    targetType: "user",
    targetId: input.userId,
    action: "user.suspend_uploads",
    reason,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
    createdAt: now,
  };
}

export async function restoreUploads(
  db: D1Database,
  input: { actorId: string; userId: string; reason: string; now?: number },
): Promise<AuditActionRow> {
  const actor = await requireActor(db, input.actorId, "user.restore_uploads");
  const reason = requireReason(input.reason);
  const now = input.now ?? Date.now();

  const user = await db
    .prepare(`SELECT id, role, upload_status FROM users WHERE id = ? LIMIT 1`)
    .bind(input.userId)
    .first<UserState>();
  if (!user) throw new AdminError("not_found");

  const before = { uploadStatus: user.upload_status };
  const after = { uploadStatus: "active" };

  const auditId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `UPDATE users SET upload_status = 'active', updated_at = ? WHERE id = ?`,
      )
      .bind(now, input.userId),
    db
      .prepare(
        `INSERT INTO moderation_actions (
           id, actor_id, target_type, target_id, action, reason,
           before_json, after_json, created_at
         ) VALUES (?, ?, 'user', ?, 'user.restore_uploads', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        actor.id,
        input.userId,
        reason,
        JSON.stringify(before),
        JSON.stringify(after),
        now,
      ),
  ]);

  return {
    id: auditId,
    actorId: actor.id,
    targetType: "user",
    targetId: input.userId,
    action: "user.restore_uploads",
    reason,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
    createdAt: now,
  };
}

export async function changeUserRole(
  db: D1Database,
  input: {
    actorId: string;
    userId: string;
    role: UserRole;
    reason: string;
    now?: number;
  },
): Promise<AuditActionRow> {
  const actor = await requireActor(db, input.actorId, "user.change_role");
  const reason = requireReason(input.reason);
  const now = input.now ?? Date.now();

  if (!["user", "moderator", "admin"].includes(input.role)) {
    throw new AdminError("invalid", "bad_role");
  }

  const user = await db
    .prepare(`SELECT id, role, upload_status FROM users WHERE id = ? LIMIT 1`)
    .bind(input.userId)
    .first<UserState>();
  if (!user) throw new AdminError("not_found");

  const before = { role: user.role };
  const after = { role: input.role };

  const auditId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`)
      .bind(input.role, now, input.userId),
    db
      .prepare(
        `INSERT INTO moderation_actions (
           id, actor_id, target_type, target_id, action, reason,
           before_json, after_json, created_at
         ) VALUES (?, ?, 'user', ?, 'user.change_role', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        actor.id,
        input.userId,
        reason,
        JSON.stringify(before),
        JSON.stringify(after),
        now,
      ),
  ]);

  return {
    id: auditId,
    actorId: actor.id,
    targetType: "user",
    targetId: input.userId,
    action: "user.change_role",
    reason,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
    createdAt: now,
  };
}

/** Convenience re-export for callers that need a single audit write. */
export { appendAuditAction };
