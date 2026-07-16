/**
 * Route-facing abuse gate facade.
 * Routes must not import ~/platform/cloudflare/**.
 */
import {
  clientIpFromRequest,
  createD1AbuseGate,
  hashIp,
  type AbuseAction,
  type AbuseGate,
} from "~/platform/cloudflare/rate-limit.server";

export type { AbuseAction, AbuseGate };

export async function checkAbuseGate(
  env: { DB: D1Database; BETTER_AUTH_SECRET: string },
  request: Request,
  input: { action: AbuseAction; userId: string },
): Promise<{ allowed: boolean; challengeRequired: boolean }> {
  const ip = clientIpFromRequest(request);
  const ipHash = await hashIp(ip, env.BETTER_AUTH_SECRET);
  const gate = createD1AbuseGate(env.DB);
  return gate.check({
    action: input.action,
    userId: input.userId,
    ipHash,
  });
}

export { clientIpFromRequest, createD1AbuseGate, hashIp };
