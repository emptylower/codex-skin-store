export const USER_ROLES = ["user", "moderator", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MODERATION_ACTIONS = [
  "report.list",
  "report.resolve",
  "report.dismiss",
  "theme.remove",
  "theme.restore",
  "comment.remove",
  "comment.restore",
  "user.suspend_uploads",
  "user.restore_uploads",
  "user.change_role",
  "copyright.view",
  "copyright.resolve",
  "seo.review",
  "analytics.export",
  "audit.read",
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

const MODERATOR_ACTIONS = new Set<ModerationAction>([
  "report.list",
  "report.resolve",
  "report.dismiss",
  "theme.remove",
  "theme.restore",
  "comment.remove",
  "comment.restore",
  "copyright.view",
  "copyright.resolve",
  "seo.review",
  "audit.read",
]);

const ADMIN_ONLY_ACTIONS = new Set<ModerationAction>([
  "user.suspend_uploads",
  "user.restore_uploads",
  "user.change_role",
  "analytics.export",
]);

export function isModeratorOrAdmin(role: UserRole | string | null | undefined) {
  return role === "moderator" || role === "admin";
}

export function isAdmin(role: UserRole | string | null | undefined) {
  return role === "admin";
}

/**
 * Pure role × action authorization matrix.
 * Service layer re-reads the actor role from DB before applying mutations.
 */
export function canPerform(
  role: UserRole | string | null | undefined,
  action: ModerationAction,
): boolean {
  if (role === "admin") {
    return (
      MODERATOR_ACTIONS.has(action) ||
      ADMIN_ONLY_ACTIONS.has(action) ||
      action === "audit.read"
    );
  }
  if (role === "moderator") {
    return MODERATOR_ACTIONS.has(action);
  }
  return false;
}

export function assertCanPerform(
  role: UserRole | string | null | undefined,
  action: ModerationAction,
): void {
  if (!canPerform(role, action)) {
    throw new Error(`forbidden:${action}`);
  }
}
