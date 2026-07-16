import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "~/db/schema";

export type AuthInstance = ReturnType<typeof createAuth>;

/**
 * Request-scoped Better Auth over D1/Drizzle.
 * Account linking requires verified matching emails; no trustedProviders.
 */
export function createAuth(env: Env, origin: string) {
  const socialProviders: NonNullable<
    Parameters<typeof betterAuth>[0]["socialProviders"]
  > = {};
  const isConfigured = (value: string | undefined) =>
    Boolean(value && value !== "placeholder-not-configured");

  if (isConfigured(env.GOOGLE_CLIENT_ID) && isConfigured(env.GOOGLE_CLIENT_SECRET)) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (isConfigured(env.GITHUB_CLIENT_ID) && isConfigured(env.GITHUB_CLIENT_SECRET)) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      scope: ["user:email"],
    };
  }

  return betterAuth({
    baseURL: origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [
      origin,
      "https://codex-dream-skin.com",
      "https://www.codex-dream-skin.com",
      "https://codexdreamskin.org",
      "https://www.codexdreamskin.org",
    ],
    database: drizzleAdapter(drizzle(env.DB, { schema }), {
      provider: "sqlite",
      schema,
      usePlural: true,
    }),
    user: {
      modelName: "users",
      // Map Better Auth core fields onto existing profile columns.
      fields: {
        name: "displayName",
        image: "avatarUrl",
      },
      additionalFields: {
        handle: {
          type: "string",
          required: true,
          input: false,
          defaultValue: () =>
            `user-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        },
        bio: {
          type: "string",
          required: false,
          input: false,
          defaultValue: "",
        },
        role: {
          type: "string",
          required: false,
          input: false,
          defaultValue: "user",
          returned: true,
        },
        uploadStatus: {
          type: "string",
          required: false,
          input: false,
          defaultValue: "active",
          returned: true,
        },
        deletionStatus: {
          type: "string",
          required: false,
          input: false,
          defaultValue: "active",
          returned: false,
        },
      },
    },
    account: {
      modelName: "accounts",
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
        requireLocalEmailVerified: true,
      },
    },
    session: {
      modelName: "sessions",
    },
    verification: {
      modelName: "verifications",
    },
    socialProviders,
  });
}

export async function requireUser(request: Request, env: Env) {
  const origin = new URL(request.url).origin;
  const session = await createAuth(env, origin).api.getSession({
    headers: request.headers,
  });
  if (!session) {
    throw new Response("Authentication required", { status: 401 });
  }
  return session.user;
}

export async function getOptionalUser(request: Request, env: Env) {
  const origin = new URL(request.url).origin;
  const session = await createAuth(env, origin).api.getSession({
    headers: request.headers,
  });
  return session?.user ?? null;
}
