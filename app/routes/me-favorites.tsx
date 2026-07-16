import { redirect } from "react-router";

import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import { listFavoriteLibrary } from "~/services/engagement/favorites.server";
import { requireUser } from "~/services/identity.server";
import type { Route } from "./+types/me-favorites";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: "Favorites · Codex Skin Store" }];
  return [
    { title: `${data.title} · Codex Skin Store` },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request, context.cloudflare.env);
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      throw redirect(localePath(locale, "/auth/sign-in"));
    }
    throw error;
  }

  const items = await listFavoriteLibrary(context.cloudflare.env.DB, {
    userId: user.id,
    locale,
  });

  const messages = getMessages(locale);
  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    title: messages.community.favoritesLibrary,
    items,
    messages,
  };
}

export default function MeFavoritesPage({ loaderData }: Route.ComponentProps) {
  const { title, items, locale, messages } = loaderData;

  return (
    <main className="me-favorites">
      <h1>{title}</h1>
      {items.length === 0 ? (
        <p>
          {messages.community.favoritesEmpty}{" "}
          <a href={localePath(locale)}>{messages.community.browseMarketplace}</a>
        </p>
      ) : (
        <ul className="me-favorites__list">
          {items.map((item) => (
            <li key={item.themeId}>
              <a href={localePath(locale, `/themes/${item.slug}`)}>
                {item.name ?? item.slug}
              </a>
              {item.summary ? <p>{item.summary}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <p>
        <a href={localePath(locale, "/me/profile")}>
          {messages.auth.profile}
        </a>
      </p>
    </main>
  );
}
