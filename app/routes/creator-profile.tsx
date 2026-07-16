import { Breadcrumbs } from "~/components/breadcrumbs";
import { ThemeCard } from "~/components/theme-card";
import {
  htmlLang,
  localePath,
  locales,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import { createServices } from "~/services/create-services.server";
import { isIndexableCreator } from "~/services/seo/index-policy";
import {
  buildBasicMeta,
  creatorPath,
  type HreflangAlternate,
} from "~/services/seo/meta.server";
import {
  absoluteUrl,
  buildBreadcrumbList,
  buildPerson,
  creatorBreadcrumbs,
} from "~/services/seo/structured-data";
import type { Route } from "./+types/creator-profile";

export function meta({ data }: Route.MetaArgs) {
  if (!data) {
    return [{ title: "Codex Skin Store" }];
  }

  const { creator, locale, origin, messages } = data;
  const canonicalPath = creatorPath(locale, creator.handle);
  const title = `${creator.displayName} · Codex Skin Store`;
  const description = creator.bio || creator.displayName;
  const indexable = isIndexableCreator({
    publicThemeCount: creator.themes.length,
  });

  const alternates: HreflangAlternate[] = locales.map((code) => ({
    locale: code,
    path: creatorPath(code, creator.handle),
  }));

  const personUrl = absoluteUrl(origin, canonicalPath);
  const structuredData = [
    buildPerson({
      name: creator.displayName,
      url: personUrl,
      description: creator.bio || undefined,
      image: creator.avatarUrl,
    }),
    buildBreadcrumbList(
      origin,
      creatorBreadcrumbs({
        locale,
        homeLabel: messages.breadcrumbs.home,
        creatorName: creator.displayName,
        creatorPath: canonicalPath,
      }),
    ),
  ];

  return buildBasicMeta({
    title,
    description,
    origin,
    canonicalPath,
    indexable,
    alternates: indexable ? alternates : undefined,
    ogType: "profile",
    structuredData,
  });
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const handle = params.handle ?? "";
  if (!handle) {
    throw new Response("Not Found", { status: 404 });
  }

  const messages = getMessages(locale);
  const { marketplace } = createServices(context.cloudflare.env);
  const creator = await marketplace.getCreator(handle, locale);
  if (!creator) {
    throw new Response("Not Found", { status: 404 });
  }

  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    origin: context.cloudflare.env.APP_ORIGIN,
    messages,
    creator,
  };
}

export default function CreatorProfilePage({
  loaderData,
}: Route.ComponentProps) {
  const { locale, messages, creator } = loaderData;

  return (
    <main className="creator-profile">
      <Breadcrumbs
        items={[
          { label: messages.breadcrumbs.home, href: localePath(locale) },
          { label: creator.displayName },
        ]}
      />

      <header className="creator-profile__header">
        <h1>{creator.displayName}</h1>
        <p className="creator-profile__handle">@{creator.handle}</p>
        {creator.bio ? (
          <p className="creator-profile__bio">{creator.bio}</p>
        ) : null}
      </header>

      <section
        className="creator-profile__themes"
        aria-label={messages.creator.themes}
      >
        <h2>{messages.creator.themes}</h2>
        {creator.themes.length === 0 ? (
          <p className="creator-profile__empty">{messages.creator.empty}</p>
        ) : (
          <ul className="creator-profile__grid">
            {creator.themes.map((theme) => (
              <li key={theme.id}>
                <ThemeCard
                  theme={theme}
                  labels={messages.theme}
                  filterLabels={messages.filters}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
