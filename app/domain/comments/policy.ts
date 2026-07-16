/** Maximum Unicode code points for a comment body. */
export const COMMENT_MAX_CODE_POINTS = 1000;

export type CommentPolicyResult =
  | { ok: true; body: string }
  | { ok: false; code: "empty" | "too_long" | "invalid" };

/**
 * Plain-text comment policy:
 * - trim Unicode whitespace
 * - reject empty
 * - cap at 1,000 Unicode code points
 * - no HTML processing here (escape on render)
 * - no parent_id / nested replies
 */
export function normalizeCommentBody(raw: string): CommentPolicyResult {
  if (typeof raw !== "string") {
    return { ok: false, code: "invalid" };
  }

  // Trim Unicode whitespace (including NBSP, fullwidth spaces, etc.).
  const trimmed = raw.replace(/^[\s\uFEFF\u200B]+|[\s\uFEFF\u200B]+$/gu, "");
  if (trimmed.length === 0) {
    return { ok: false, code: "empty" };
  }

  // Reject control characters except newline/tab (still plain text).
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, code: "invalid" };
  }

  const codePoints = [...trimmed];
  if (codePoints.length > COMMENT_MAX_CODE_POINTS) {
    return { ok: false, code: "too_long" };
  }

  return { ok: true, body: trimmed };
}

/** Escape for HTML text nodes; do not auto-link URLs. */
export function escapeCommentHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
