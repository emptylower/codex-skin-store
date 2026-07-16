import { z } from "zod";

import {
  AUTH_INTENT_ACTIONS,
  type AuthIntentAction,
} from "~/db/schema/engagement";

export { AUTH_INTENT_ACTIONS, type AuthIntentAction };

/** Intent lifetime: 10 minutes. */
export const AUTH_INTENT_TTL_MS = 10 * 60 * 1000;

/**
 * Relative app paths only: must start with single slash, no scheme, no //.
 * Blocks open redirects to absolute URLs or protocol-relative hosts.
 */
export function validateReturnPath(path: string): boolean {
  if (typeof path !== "string") return false;
  if (path.length === 0 || path.length > 512) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;
  if (path.includes("\\")) return false;
  // Reject control characters and whitespace that could smuggle headers.
  if (/[\u0000-\u001f\u007f\s]/.test(path)) return false;
  return true;
}

export function isAuthIntentAction(value: string): value is AuthIntentAction {
  return (AUTH_INTENT_ACTIONS as readonly string[]).includes(value);
}

/** Payload stored server-side; only safe keys allowed. */
export const intentPayloadSchema = z
  .object({
    returnPath: z
      .string()
      .max(512)
      .refine(validateReturnPath, "invalid_return_path")
      .optional(),
    platform: z.enum(["macos", "windows", "both"]).optional(),
    body: z.string().max(2000).optional(),
    reason: z.string().max(64).optional(),
    details: z.string().max(2000).optional(),
    targetType: z.enum(["theme", "comment", "user"]).optional(),
    targetId: z.string().max(128).optional(),
  })
  .strict();

export type IntentPayload = z.infer<typeof intentPayloadSchema>;

export function parseIntentPayload(json: string): IntentPayload {
  let raw: unknown = {};
  try {
    raw = JSON.parse(json) as unknown;
  } catch {
    return {};
  }
  const parsed = intentPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}
