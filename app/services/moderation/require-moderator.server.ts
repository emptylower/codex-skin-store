import {
  canPerform,
  isModeratorOrAdmin,
  type ModerationAction,
  type UserRole,
} from "~/domain/moderation/policy";
import { getOptionalUser } from "~/services/identity.server";

export type SessionUser = {
  id: string;
  role?: string | null;
  [key: string]: unknown;
};

export async function requireModerator(
  request: Request,
  env: Env,
  action: ModerationAction = "report.list",
): Promise<SessionUser & { role: UserRole | string }> {
  const user = (await getOptionalUser(request, env)) as SessionUser | null;
  if (!user) {
    throw new Response("Authentication required", { status: 401 });
  }
  const role = String(user.role ?? "user");
  if (!isModeratorOrAdmin(role) || !canPerform(role, action)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return { ...user, role };
}

export async function requireAdmin(
  request: Request,
  env: Env,
  action: ModerationAction = "user.suspend_uploads",
): Promise<SessionUser & { role: UserRole | string }> {
  return requireModerator(request, env, action);
}
