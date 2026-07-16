import { z } from "zod";

import { appendAuditAction } from "./audit.server";
import { removeTheme } from "./admin.server";

export const EVIDENCE_KEY_PREFIX = "evidence";
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_EVIDENCE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
] as const;

export const copyrightClaimSchema = z.object({
  claimantEmail: z.string().email().max(320),
  claimantName: z.string().min(2).max(200),
  targetThemeId: z.string().min(1).max(128),
  rightsBasis: z.string().min(3).max(500),
  statement: z
    .string()
    .min(20)
    .max(5000)
    .refine(
      (value) =>
        /perjury/i.test(value) ||
        /good.?faith/i.test(value) ||
        /I am the (owner|copyright)/i.test(value),
      "statement_must_include_good_faith_or_perjury",
    ),
  signature: z.string().min(2).max(200),
});

export type CopyrightClaimInput = z.infer<typeof copyrightClaimSchema>;

export type EvidenceInput = {
  bytes: Uint8Array;
  mediaType: string;
  sha256: string;
};

export class TakedownError extends Error {
  readonly code:
    | "invalid"
    | "not_found"
    | "duplicate"
    | "rate_limited"
    | "forbidden"
    | "evidence_invalid";

  constructor(code: TakedownError["code"], message?: string) {
    super(message ?? code);
    this.name = "TakedownError";
    this.code = code;
  }
}

export function evidenceObjectKey(claimId: string, evidenceId: string): string {
  return `${EVIDENCE_KEY_PREFIX}/${claimId}/${evidenceId}`;
}

export function validateEvidenceMeta(input: {
  mediaType: string;
  byteSize: number;
  objectKey: string;
  claimId: string;
  evidenceId: string;
}): void {
  if (
    !(ALLOWED_EVIDENCE_TYPES as readonly string[]).includes(input.mediaType)
  ) {
    throw new TakedownError("evidence_invalid", "mime");
  }
  if (input.byteSize <= 0 || input.byteSize > MAX_EVIDENCE_BYTES) {
    throw new TakedownError("evidence_invalid", "size");
  }
  const expected = evidenceObjectKey(input.claimId, input.evidenceId);
  if (input.objectKey !== expected) {
    throw new TakedownError("evidence_invalid", "key");
  }
  if (
    input.objectKey.startsWith("packages/") ||
    input.objectKey.startsWith("sources/")
  ) {
    throw new TakedownError("evidence_invalid", "path");
  }
}

async function themeExists(db: D1Database, themeId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT id FROM themes WHERE id = ? LIMIT 1`)
    .bind(themeId)
    .first();
  return Boolean(row);
}

/**
 * Intake a copyright claim. Does not auto-delete theme content.
 * Evidence must use evidence/{claim-id}/{id} keys in SOURCES only.
 */
export async function createCopyrightClaim(
  db: D1Database,
  input: CopyrightClaimInput & {
    evidence?: Array<{
      mediaType: string;
      byteSize: number;
      sha256: string;
      /** Optional pre-generated ids for deterministic tests. */
      id?: string;
    }>;
    now?: number;
    storeEvidence?: (args: {
      claimId: string;
      evidenceId: string;
      objectKey: string;
      mediaType: string;
      sha256: string;
      byteSize: number;
    }) => Promise<void>;
  },
): Promise<{ id: string; status: "open"; evidenceKeys: string[] }> {
  const parsed = copyrightClaimSchema.safeParse(input);
  if (!parsed.success) {
    throw new TakedownError("invalid", parsed.error.message);
  }
  if (!(await themeExists(db, parsed.data.targetThemeId))) {
    throw new TakedownError("not_found");
  }

  const now = input.now ?? Date.now();
  const since = now - 24 * 60 * 60 * 1000;
  const duplicate = await db
    .prepare(
      `SELECT id FROM copyright_claims
       WHERE claimant_email = ?
         AND target_theme_id = ?
         AND created_at >= ?
         AND status IN ('open', 'needs_information')
       LIMIT 1`,
    )
    .bind(parsed.data.claimantEmail.toLowerCase(), parsed.data.targetThemeId, since)
    .first();
  if (duplicate) throw new TakedownError("duplicate");

  const claimId = crypto.randomUUID();
  const evidenceKeys: string[] = [];

  await db
    .prepare(
      `INSERT INTO copyright_claims (
         id, claimant_email, claimant_name, target_theme_id,
         rights_basis, statement, signature, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
    .bind(
      claimId,
      parsed.data.claimantEmail.toLowerCase(),
      parsed.data.claimantName.trim(),
      parsed.data.targetThemeId,
      parsed.data.rightsBasis.trim(),
      parsed.data.statement.trim(),
      parsed.data.signature.trim(),
      now,
    )
    .run();

  for (const item of input.evidence ?? []) {
    const evidenceId = item.id ?? crypto.randomUUID();
    const objectKey = evidenceObjectKey(claimId, evidenceId);
    validateEvidenceMeta({
      mediaType: item.mediaType,
      byteSize: item.byteSize,
      objectKey,
      claimId,
      evidenceId,
    });
    if (input.storeEvidence) {
      await input.storeEvidence({
        claimId,
        evidenceId,
        objectKey,
        mediaType: item.mediaType,
        sha256: item.sha256,
        byteSize: item.byteSize,
      });
    }
    await db
      .prepare(
        `INSERT INTO copyright_evidence (
           id, claim_id, object_key, sha256, media_type, byte_size, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        evidenceId,
        claimId,
        objectKey,
        item.sha256,
        item.mediaType,
        item.byteSize,
        now,
      )
      .run();
    evidenceKeys.push(objectKey);
  }

  // Claimant PII is not exposed by this return value.
  return { id: claimId, status: "open", evidenceKeys };
}

export async function resolveCopyrightClaim(
  db: D1Database,
  input: {
    actorId: string;
    claimId: string;
    outcome: "accepted" | "rejected" | "needs_information" | "withdrawn";
    reason: string;
    now?: number;
  },
): Promise<{ claimId: string; status: string; themeRemoved: boolean }> {
  const now = input.now ?? Date.now();
  const claim = await db
    .prepare(
      `SELECT id, status, target_theme_id FROM copyright_claims WHERE id = ? LIMIT 1`,
    )
    .bind(input.claimId)
    .first<{ id: string; status: string; target_theme_id: string }>();
  if (!claim) throw new TakedownError("not_found");
  if (["accepted", "rejected", "withdrawn"].includes(claim.status)) {
    throw new TakedownError("invalid", "already_resolved");
  }

  const before = { status: claim.status };
  const after = { status: input.outcome, resolvedAt: now };

  await db
    .prepare(
      `UPDATE copyright_claims
       SET status = ?, assigned_to = ?, resolved_at = ?
       WHERE id = ?`,
    )
    .bind(input.outcome, input.actorId, now, input.claimId)
    .run();

  await appendAuditAction(db, {
    actorId: input.actorId,
    targetType: "copyright_claim",
    targetId: input.claimId,
    action: `copyright.${input.outcome}`,
    reason: input.reason,
    before,
    after,
    now,
  });

  let themeRemoved = false;
  if (input.outcome === "accepted") {
    await removeTheme(db, {
      actorId: input.actorId,
      themeId: claim.target_theme_id,
      reason: `copyright claim ${input.claimId}: ${input.reason}`,
      now,
    });
    themeRemoved = true;
  }

  // Rejected/withdrawn do not auto-restore content (other bases may apply).
  return { claimId: input.claimId, status: input.outcome, themeRemoved };
}
