import {
  AUTH_INTENT_TTL_MS,
  intentPayloadSchema,
  isAuthIntentAction,
  parseIntentPayload,
  validateReturnPath,
  type AuthIntentAction,
  type IntentPayload,
} from "~/domain/engagement/intent";

export type CreateIntentInput = {
  action: AuthIntentAction;
  themeId: string;
  payload?: IntentPayload;
  now?: number;
};

export type CreateIntentResult = {
  id: string;
  token: string;
  expiresAt: number;
};

export type ConsumedIntent = {
  id: string;
  action: AuthIntentAction;
  themeId: string;
  payload: IntentPayload;
  expiresAt: number;
  createdAt: number;
};

export class IntentError extends Error {
  readonly code:
    | "invalid_action"
    | "invalid_payload"
    | "not_found"
    | "expired"
    | "already_consumed"
    | "theme_mismatch";

  constructor(code: IntentError["code"], message?: string) {
    super(message ?? code);
    this.name = "IntentError";
    this.code = code;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  // btoa is available in Workers; convert to base64url.
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashIntentToken(token: string): Promise<string> {
  return sha256Hex(token);
}

/**
 * Create a single-use intent. Client receives plaintext token once;
 * only SHA-256(token) is stored in D1.
 */
export async function createIntent(
  db: D1Database,
  input: CreateIntentInput,
): Promise<CreateIntentResult> {
  if (!isAuthIntentAction(input.action)) {
    throw new IntentError("invalid_action");
  }
  if (!input.themeId || input.themeId.length > 128) {
    throw new IntentError("invalid_payload", "invalid_theme_id");
  }

  const payload = intentPayloadSchema.parse(input.payload ?? {});
  if (payload.returnPath && !validateReturnPath(payload.returnPath)) {
    throw new IntentError("invalid_payload", "invalid_return_path");
  }

  const now = input.now ?? Date.now();
  const expiresAt = now + AUTH_INTENT_TTL_MS;
  const id = crypto.randomUUID();
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64Url(tokenBytes);
  const tokenHash = await hashIntentToken(token);

  await db
    .prepare(
      `INSERT INTO auth_intents (
         id, token_hash, action, theme_id, payload_json, expires_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      tokenHash,
      input.action,
      input.themeId,
      JSON.stringify(payload),
      expiresAt,
      now,
    )
    .run();

  return { id, token, expiresAt };
}

/**
 * Consume intent with conditional UPDATE. Proceed only when meta.changes === 1.
 */
export async function consumeIntent(
  db: D1Database,
  token: string,
  options?: { themeId?: string; now?: number },
): Promise<ConsumedIntent> {
  if (!token || token.length > 128) {
    throw new IntentError("not_found");
  }

  const now = options?.now ?? Date.now();
  const tokenHash = await hashIntentToken(token);

  const update = await db
    .prepare(
      `UPDATE auth_intents
       SET consumed_at = ?
       WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
    )
    .bind(now, tokenHash, now)
    .run();

  const changes = update.meta?.changes ?? 0;
  if (changes !== 1) {
    // Distinguish expired/consumed/missing for callers that care.
    const existing = await db
      .prepare(
        `SELECT id, action, theme_id, payload_json, expires_at, consumed_at, created_at
         FROM auth_intents WHERE token_hash = ? LIMIT 1`,
      )
      .bind(tokenHash)
      .first<{
        id: string;
        action: string;
        theme_id: string;
        payload_json: string;
        expires_at: number;
        consumed_at: number | null;
        created_at: number;
      }>();

    if (!existing) throw new IntentError("not_found");
    if (existing.consumed_at != null) {
      throw new IntentError("already_consumed");
    }
    if (existing.expires_at <= now) throw new IntentError("expired");
    throw new IntentError("not_found");
  }

  const row = await db
    .prepare(
      `SELECT id, action, theme_id, payload_json, expires_at, created_at
       FROM auth_intents WHERE token_hash = ? LIMIT 1`,
    )
    .bind(tokenHash)
    .first<{
      id: string;
      action: string;
      theme_id: string;
      payload_json: string;
      expires_at: number;
      created_at: number;
    }>();

  if (!row || !isAuthIntentAction(row.action)) {
    throw new IntentError("not_found");
  }

  if (options?.themeId && options.themeId !== row.theme_id) {
    throw new IntentError("theme_mismatch");
  }

  return {
    id: row.id,
    action: row.action,
    themeId: row.theme_id,
    payload: parseIntentPayload(row.payload_json),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/** Build sign-in URL that carries a pending intent token. */
export function signInPathWithIntent(
  locale: string,
  token: string,
  returnPath?: string,
): string {
  const params = new URLSearchParams({ intent: token });
  if (returnPath && validateReturnPath(returnPath)) {
    params.set("return", returnPath);
  }
  return `/${locale}/auth/sign-in?${params.toString()}`;
}
