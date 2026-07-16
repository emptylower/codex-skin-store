import { useState } from "react";
import { redirect } from "react-router";

import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import { validateReturnPath } from "~/domain/engagement/intent";
import { consumeIntent, IntentError } from "~/services/identity/intents.server";
import { getOptionalUser, requireUser } from "~/services/identity.server";
import { addFavorite } from "~/services/engagement/favorites.server";
import type { Route } from "./+types/auth.sign-in";

function safeCallback(
  locale: string,
  returnPath: string | null,
  fallback: string,
): string {
  if (returnPath && validateReturnPath(returnPath)) {
    return returnPath;
  }
  return fallback;
}

/**
 * After OAuth, restore gated intent without auto-writing clipboard.
 * download → authorized download route; copy_prompt → confirmation UI.
 */
async function resumeAfterAuth(options: {
  request: Request;
  env: Env;
  locale: string;
  intentToken: string | null;
  returnPath: string | null;
}): Promise<Response | null> {
  const { request, env, locale, intentToken, returnPath } = options;
  if (!intentToken) return null;

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request, env);
  } catch {
    return null;
  }

  try {
    const intent = await consumeIntent(env.DB, intentToken);
    const themeId = intent.themeId;
    const payloadReturn =
      intent.payload.returnPath && validateReturnPath(intent.payload.returnPath)
        ? intent.payload.returnPath
        : null;
    const dest = payloadReturn ?? returnPath;

    const slugRow = await env.DB.prepare(
      `SELECT slug FROM themes WHERE id = ? LIMIT 1`,
    )
      .bind(themeId)
      .first<{ slug: string }>();
    const slug = slugRow?.slug;
    const themePath = slug
      ? `/${locale}/themes/${encodeURIComponent(slug)}`
      : dest && validateReturnPath(dest)
        ? dest
        : `/${locale}`;

    switch (intent.action) {
      case "download":
        if (!slug) return redirect(themePath);
        return redirect(
          `/${locale}/themes/${encodeURIComponent(slug)}/download`,
        );
      case "copy_prompt": {
        const base = dest && validateReturnPath(dest) ? dest : themePath;
        const url = new URL(base, "http://local.invalid");
        url.searchParams.set("resume", "copy_prompt");
        return redirect(`${url.pathname}${url.search}`);
      }
      case "favorite": {
        await addFavorite(env.DB, { userId: user.id, themeId });
        const favDest = dest && validateReturnPath(dest) ? dest : themePath;
        return redirect(favDest);
      }
      case "comment": {
        const base = dest && validateReturnPath(dest) ? dest : themePath;
        const url = new URL(base, "http://local.invalid");
        url.searchParams.set("resume", "comment");
        if (intent.payload.body) {
          url.searchParams.set("draft", intent.payload.body.slice(0, 1000));
        }
        return redirect(`${url.pathname}${url.search}`);
      }
      case "report": {
        const base = dest && validateReturnPath(dest) ? dest : themePath;
        const url = new URL(base, "http://local.invalid");
        url.searchParams.set("resume", "report");
        if (intent.payload.reason) {
          url.searchParams.set("reason", intent.payload.reason);
        }
        return redirect(`${url.pathname}${url.search}`);
      }
      default:
        return null;
    }
  } catch (error) {
    if (error instanceof IntentError) {
      return null;
    }
    throw error;
  }
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: "Sign in · Codex Skin Store" }];
  return [
    { title: `${data.title} · Codex Skin Store` },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const intentToken = url.searchParams.get("intent");
  const returnParam = url.searchParams.get("return");
  const returnPath =
    returnParam && validateReturnPath(returnParam) ? returnParam : null;

  const user = await getOptionalUser(request, context.cloudflare.env);
  if (user) {
    const resumed = await resumeAfterAuth({
      request,
      env: context.cloudflare.env,
      locale,
      intentToken,
      returnPath,
    });
    if (resumed) return resumed;
    throw redirect(safeCallback(locale, returnPath, localePath(locale)));
  }

  const messages = getMessages(locale);
  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  // Post-OAuth callback lands on marketplace by default; when an intent is
  // present, return to this sign-in page so the loader can resume the action.
  const callbackURL = intentToken
    ? `${localePath(locale, "/auth/sign-in")}?intent=${encodeURIComponent(intentToken)}${
        returnPath ? `&return=${encodeURIComponent(returnPath)}` : ""
      }`
    : safeCallback(locale, returnPath, localePath(locale));

  return {
    ...localeData,
    title: messages.auth.signIn,
    socialAction: "/api/auth/sign-in/social",
    callbackURL,
    intentToken,
    returnPath,
  };
}

type SocialProvider = "google" | "github";

async function startSocialSignIn(
  action: string,
  provider: SocialProvider,
  callbackURL: string,
) {
  const response = await fetch(action, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ provider, callbackURL }),
  });

  let payload: { url?: string; redirect?: boolean; message?: string } | null =
    null;
  try {
    payload = (await response.json()) as {
      url?: string;
      redirect?: boolean;
      message?: string;
    };
  } catch {
    payload = null;
  }

  if (payload?.url) {
    window.location.assign(payload.url);
    return;
  }

  const location = response.headers.get("Location");
  if (location) {
    window.location.assign(location);
    return;
  }

  throw new Error(
    payload?.message || `Sign-in with ${provider} failed (${response.status})`,
  );
}

export default function SignIn({ loaderData }: Route.ComponentProps) {
  const { title, socialAction, callbackURL, locale } = loaderData;
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onProviderClick(provider: SocialProvider) {
    setError(null);
    setPending(provider);
    try {
      await startSocialSignIn(socialAction, provider, callbackURL);
    } catch (err) {
      setPending(null);
      setError(err instanceof Error ? err.message : "Sign-in failed");
    }
  }

  return (
    <main className="auth-sign-in">
      <h1>{title}</h1>
      <p>
        Continue with a trusted OAuth provider to create or open your profile.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <ul className="auth-providers">
        <li>
          <form
            method="post"
            action={socialAction}
            onSubmit={(event) => {
              event.preventDefault();
              void onProviderClick("google");
            }}
          >
            <input type="hidden" name="provider" value="google" />
            <input type="hidden" name="callbackURL" value={callbackURL} />
            <button
              type="submit"
              data-provider="google"
              disabled={pending !== null}
            >
              {pending === "google" ? "Redirecting…" : "Continue with Google"}
            </button>
          </form>
        </li>
        <li>
          <form
            method="post"
            action={socialAction}
            onSubmit={(event) => {
              event.preventDefault();
              void onProviderClick("github");
            }}
          >
            <input type="hidden" name="provider" value="github" />
            <input type="hidden" name="callbackURL" value={callbackURL} />
            <button
              type="submit"
              data-provider="github"
              disabled={pending !== null}
            >
              {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
            </button>
          </form>
        </li>
      </ul>
      <p>
        <a href={localePath(locale)}>Back to marketplace</a>
      </p>
    </main>
  );
}
