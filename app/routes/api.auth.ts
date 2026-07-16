import { createAuth } from "~/services/identity.server";
import type { Route } from "./+types/api.auth";

/**
 * Better Auth catch-all. Return handler Response directly so every
 * Set-Cookie header (including multi-value) is preserved.
 */
async function handleAuth({ request, context }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin;
  const auth = createAuth(context.cloudflare.env, origin);
  return auth.handler(request);
}

export async function loader(args: Route.LoaderArgs) {
  return handleAuth(args);
}

export async function action(args: Route.ActionArgs) {
  return handleAuth(args);
}
