import { useState } from "react";

import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import type { Route } from "./+types/auth.sign-in";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: "Sign in · Codex Skin Store" }];
  return [
    { title: `${data.title} · Codex Skin Store` },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const messages = getMessages(locale);
  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    title: messages.auth.signIn,
    // Better Auth 1.6.23: POST /sign-in/social, application/json only
    // (router default allowedMediaTypes; form-urlencoded is 415).
    socialAction: "/api/auth/sign-in/social",
    callbackURL: localePath(locale),
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
    payload?.message ||
      `Sign-in with ${provider} failed (${response.status})`,
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
      <p>Continue with a trusted OAuth provider to create or open your profile.</p>
      {error ? <p role="alert">{error}</p> : null}
      <ul className="auth-providers">
        <li>
          {/*
            Progressive enhancement shell: native form is present for semantics,
            but Better Auth 1.6.23 only accepts application/json for social sign-in
            (router-level allowedMediaTypes). Submit is intercepted for JSON POST.
          */}
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
