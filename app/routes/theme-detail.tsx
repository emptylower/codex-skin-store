import { Breadcrumbs } from "~/components/breadcrumbs";
import { ThemeCard } from "~/components/theme-card";
import { ThemeFacts } from "~/components/theme-facts";
import { ThemePreview } from "~/components/theme-preview/theme-preview";
import {
  htmlLang,
  localePath,
  parseLocale,
  type Locale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import { createServices } from "~/services/create-services.server";
import type { ThemeDetail as ThemeDetailModel } from "~/services/marketplace/types";
import { isIndexableTheme } from "~/services/seo/index-policy";
import {
  buildBasicMeta,
  creatorPath,
  themePath,
  type HreflangAlternate,
} from "~/services/seo/meta";
import {
  absoluteUrl,
  buildBreadcrumbList,
  buildCreativeWork,
  buildPerson,
  themeBreadcrumbs,
} from "~/services/seo/structured-data";
import type { Route } from "./+types/theme-detail";

function readPreviewExtras(theme: ThemeDetailModel) {
  const preview = theme.preview;
  return {
    palette: preview?.palette ?? {
      bg: "#0f172a",
      fg: "#f8fafc",
      accent: "#38bdf8",
      muted: "#94a3b8",
    },
    focalPoint: {
      x: preview?.focalX ?? 0.5,
      y: preview?.focalY ?? 0.4,
    },
    overlay: preview?.overlay ?? 0.35,
  };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) {
    return [{ title: "Codex Skin Store" }];
  }

  const { theme, locale, origin, messages } = data;
  const canonicalPath = themePath(locale, theme.slug);
  // Prefer full description for crawlable meta; fall back to summary.
  const description = theme.description || theme.summary;
  const title = `${theme.name} · Codex Skin Store`;
  const indexable = isIndexableTheme(
    {
      visibility: theme.visibility,
      moderationStatus: theme.moderationStatus,
      packageStatus: theme.packageStatus,
      translationStatus: theme.translationStatus,
    },
    locale,
  );

  const alternates: HreflangAlternate[] = theme.availableLocales.map(
    (code: Locale) => ({
      locale: code,
      path: themePath(code, theme.slug),
    }),
  );

  const creatorUrl = absoluteUrl(
    origin,
    creatorPath(locale, theme.creator.handle),
  );
  const themeUrl = absoluteUrl(origin, canonicalPath);

  const structuredData = [
    buildCreativeWork({
      name: theme.name,
      description,
      url: themeUrl,
      image: theme.coverImage ?? theme.previewImage,
      creatorName: theme.creator.displayName,
      creatorUrl,
      dateModified: theme.updatedAt,
    }),
    buildPerson({
      name: theme.creator.displayName,
      url: creatorUrl,
    }),
    buildBreadcrumbList(
      origin,
      themeBreadcrumbs({
        locale,
        homeLabel: messages.breadcrumbs.home,
        themeName: theme.name,
        themePath: canonicalPath,
      }),
    ),
  ];

  return buildBasicMeta({
    title,
    description,
    origin,
    canonicalPath,
    indexable,
    alternates,
    ogType: "article",
    structuredData,
  });
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const slug = params.slug ?? "";
  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  const messages = getMessages(locale);
  const { marketplace } = createServices(context.cloudflare.env);
  const theme = await marketplace.getTheme(slug, locale);
  if (!theme) {
    throw new Response("Not Found", { status: 404 });
  }

  const related = await marketplace.getRelatedThemes(slug, locale, 5);
  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    origin: context.cloudflare.env.APP_ORIGIN,
    messages,
    theme,
    related,
  };
}

export default function ThemeDetailPage({ loaderData }: Route.ComponentProps) {
  const { locale, messages, theme, related } = loaderData;
  const previewExtras = readPreviewExtras(theme);

  return (
    <main className="theme-detail">
      <Breadcrumbs
        items={[
          { label: messages.breadcrumbs.home, href: localePath(locale) },
          { label: theme.name },
        ]}
      />

      <header className="theme-detail__header">
        <h1>{theme.name}</h1>
        <p className="theme-detail__byline">
          <span>{messages.theme.by}</span>{" "}
          <a href={localePath(locale, `/creators/${theme.creator.handle}`)}>
            {theme.creator.displayName}
          </a>
        </p>
      </header>

      <section
        className="theme-detail__preview"
        aria-label={messages.marketplace.simulator}
      >
        <ThemePreview
          theme={{
            name: theme.name,
            coverImage: theme.coverImage,
            previewImage: theme.previewImage,
            mode: theme.mode,
            platform: theme.platform,
            ...previewExtras,
          }}
          labels={messages.preview}
        />
      </section>

      <section
        className="theme-detail__description"
        aria-label={messages.theme.description}
      >
        <h2>{messages.theme.description}</h2>
        <p>{theme.description}</p>
      </section>

      <ThemeFacts
        theme={theme}
        labels={messages.theme}
        filterLabels={messages.filters}
      />

      <section
        className="theme-detail__package"
        aria-label={messages.theme.package}
      >
        <h2>{messages.theme.package}</h2>
        <dl className="theme-detail__package-list">
          <div>
            <dt>{messages.theme.packageStatus}</dt>
            <dd>{messages.theme.packageReady}</dd>
          </div>
          {theme.payloadDigest ? (
            <div>
              <dt>{messages.theme.payloadDigest}</dt>
              <dd>{theme.payloadDigest}</dd>
            </div>
          ) : null}
          {theme.archiveDigest ? (
            <div>
              <dt>{messages.theme.archiveDigest}</dt>
              <dd>{theme.archiveDigest}</dd>
            </div>
          ) : null}
        </dl>
        <p className="theme-detail__install">
          {messages.theme.installPrerequisites}
        </p>
      </section>

      <section
        className="theme-detail__author"
        aria-label={messages.theme.author}
      >
        <h2>{messages.theme.author}</h2>
        <p>
          <a href={localePath(locale, `/creators/${theme.creator.handle}`)}>
            {theme.creator.displayName}
          </a>{" "}
          <span className="theme-detail__handle">@{theme.creator.handle}</span>
        </p>
      </section>

      {related.length > 0 ? (
        <section
          className="theme-detail__related"
          aria-label={messages.theme.related}
        >
          <h2>{messages.theme.related}</h2>
          <ul className="theme-detail__related-grid">
            {related.map((item) => (
              <li key={item.id}>
                <ThemeCard
                  theme={item}
                  labels={messages.theme}
                  filterLabels={messages.filters}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
