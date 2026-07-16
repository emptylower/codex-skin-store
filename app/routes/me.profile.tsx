import { Form, redirect } from "react-router";

import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import { requireUser } from "~/services/identity.server";
import {
  getProfile,
  ProfileError,
  updateProfile,
} from "~/services/profiles.server";
import type { Route } from "./+types/me.profile";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: "Profile · Codex Skin Store" }];
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

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request, context.cloudflare.env);
  } catch (error) {
    // HTML profile page should send anonymous visitors to sign-in.
    if (error instanceof Response && error.status === 401) {
      throw redirect(localePath(locale, "/auth/sign-in"));
    }
    throw error;
  }

  const profile = await getProfile(context.cloudflare.env.DB, user.id);
  if (!profile) {
    throw new Response("Profile not found", { status: 404 });
  }

  const messages = getMessages(locale);
  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    title: messages.auth.profile,
    profile,
    error: null as string | null,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const user = await requireUser(request, context.cloudflare.env);
  const form = await request.formData();
  const handle = String(form.get("handle") ?? "");
  const displayName = String(form.get("displayName") ?? "");
  const bio = String(form.get("bio") ?? "");

  try {
    await updateProfile(context.cloudflare.env.DB, user.id, {
      handle,
      displayName,
      bio,
    });
  } catch (error) {
    if (error instanceof ProfileError) {
      const profile = await getProfile(context.cloudflare.env.DB, user.id);
      const messages = getMessages(locale);
      return {
        locale,
        htmlLang: htmlLang(locale),
        title: messages.auth.profile,
        profile: profile ?? {
          id: user.id,
          handle,
          displayName,
          bio,
          avatarUrl: null,
          role: "user",
          uploadStatus: "active",
          email: null,
        },
        error: error.code,
      };
    }
    throw error;
  }

  return redirect(localePath(locale, "/me/profile"));
}

export default function ProfilePage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const data = actionData ?? loaderData;
  const { title, profile, error, locale } = data;

  return (
    <main className="me-profile">
      <h1>{title}</h1>
      {error ? <p role="alert">{error}</p> : null}
      <Form method="post">
        <label>
          Handle
          <input
            name="handle"
            type="text"
            defaultValue={profile.handle}
            minLength={3}
            maxLength={32}
            required
          />
        </label>
        <label>
          Display name
          <input
            name="displayName"
            type="text"
            defaultValue={profile.displayName}
            maxLength={80}
            required
          />
        </label>
        <label>
          Bio
          <textarea
            name="bio"
            defaultValue={profile.bio}
            maxLength={280}
            rows={4}
          />
        </label>
        <button type="submit">Save profile</button>
      </Form>
      <p>
        <a href={localePath(locale)}>Back to marketplace</a>
      </p>
    </main>
  );
}
