import { redirect } from "react-router";

import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import {
  DELETE_CONFIRMATION_PHRASE,
  deleteAccount,
  DeleteAccountError,
} from "~/services/identity/delete-account.server";
import { requireUser } from "~/services/identity.server";
import type { Route } from "./+types/account-delete";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: "Delete account · Codex Skin Store" }];
  return [
    { title: `${data.title} · Codex Skin Store` },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  try {
    await requireUser(request, context.cloudflare.env);
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      throw redirect(localePath(locale, "/auth/sign-in"));
    }
    throw error;
  }

  const messages = getMessages(locale);
  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    title: messages.community.deleteAccount,
    confirmationPhrase: DELETE_CONFIRMATION_PHRASE,
    error: null as string | null,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  const user = await requireUser(request, context.cloudflare.env);
  const form = await request.formData();
  const confirmation = String(form.get("confirmation") ?? "");

  try {
    await deleteAccount(context.cloudflare.env.DB, {
      userId: user.id,
      confirmation,
    });
  } catch (error) {
    if (error instanceof DeleteAccountError) {
      const messages = getMessages(locale);
      return {
        locale,
        htmlLang: htmlLang(locale),
        title: messages.community.deleteAccount,
        confirmationPhrase: DELETE_CONFIRMATION_PHRASE,
        error: error.code,
      };
    }
    throw error;
  }

  throw redirect(localePath(locale));
}

export default function AccountDeletePage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const data = actionData ?? loaderData;
  const { title, confirmationPhrase, error, locale } = data;

  return (
    <main className="account-delete">
      <h1>{title}</h1>
      <p>
        This permanently removes your sign-in sessions, favorites, and OAuth
        links. Comments are anonymized. Your public themes become unlisted.
      </p>
      <p>
        Type <strong>{confirmationPhrase}</strong> to confirm.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <form method="post">
        <label>
          Confirmation
          <input
            name="confirmation"
            type="text"
            autoComplete="off"
            required
            data-testid="delete-confirmation"
          />
        </label>
        <button type="submit" data-testid="delete-account-submit">
          Delete account
        </button>
      </form>
      <p>
        <a href={localePath(locale, "/me/profile")}>Cancel</a>
      </p>
    </main>
  );
}
