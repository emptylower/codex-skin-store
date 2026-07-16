import type { ModerationTargetType } from "~/db/schema/moderation";

export type AuditActionRow = {
  id: string;
  actorId: string;
  targetType: ModerationTargetType | string;
  targetId: string;
  action: string;
  reason: string;
  beforeJson: string;
  afterJson: string;
  createdAt: number;
};

export type AppendAuditInput = {
  actorId: string;
  targetType: ModerationTargetType | string;
  targetId: string;
  action: string;
  reason: string;
  before: unknown;
  after: unknown;
  now?: number;
  id?: string;
};

/**
 * Immutable audit log: insert + read only.
 * No public update/delete APIs exist by design.
 */
export async function appendAuditAction(
  db: D1Database,
  input: AppendAuditInput,
): Promise<AuditActionRow> {
  const id = input.id ?? crypto.randomUUID();
  const createdAt = input.now ?? Date.now();
  const beforeJson = JSON.stringify(input.before ?? {});
  const afterJson = JSON.stringify(input.after ?? {});

  await db
    .prepare(
      `INSERT INTO moderation_actions (
         id, actor_id, target_type, target_id, action, reason,
         before_json, after_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.actorId,
      input.targetType,
      input.targetId,
      input.action,
      input.reason.trim(),
      beforeJson,
      afterJson,
      createdAt,
    )
    .run();

  return {
    id,
    actorId: input.actorId,
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    reason: input.reason.trim(),
    beforeJson,
    afterJson,
    createdAt,
  };
}

export async function listAuditActions(
  db: D1Database,
  options?: {
    targetType?: string;
    targetId?: string;
    limit?: number;
    cursor?: number;
  },
): Promise<AuditActionRow[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const cursor = options?.cursor ?? Number.MAX_SAFE_INTEGER;

  let query = `SELECT id, actor_id AS actorId, target_type AS targetType,
                      target_id AS targetId, action, reason,
                      before_json AS beforeJson, after_json AS afterJson,
                      created_at AS createdAt
               FROM moderation_actions
               WHERE created_at < ?`;
  const binds: Array<string | number> = [cursor];

  if (options?.targetType) {
    query += ` AND target_type = ?`;
    binds.push(options.targetType);
  }
  if (options?.targetId) {
    query += ` AND target_id = ?`;
    binds.push(options.targetId);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  binds.push(limit);

  const result = await db
    .prepare(query)
    .bind(...binds)
    .all<AuditActionRow>();
  return result.results ?? [];
}

export async function getAuditAction(
  db: D1Database,
  id: string,
): Promise<AuditActionRow | null> {
  return (
    (await db
      .prepare(
        `SELECT id, actor_id AS actorId, target_type AS targetType,
                target_id AS targetId, action, reason,
                before_json AS beforeJson, after_json AS afterJson,
                created_at AS createdAt
         FROM moderation_actions WHERE id = ? LIMIT 1`,
      )
      .bind(id)
      .first<AuditActionRow>()) ?? null
  );
}

/** Intentionally not exported as a public service: audit rows are immutable. */
export function assertAuditImmutable(): never {
  throw new Error("audit_immutable");
}
