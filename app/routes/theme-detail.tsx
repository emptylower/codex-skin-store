import { Breadcrumbs } from "~/components/breadcrumbs";
import { CommentForm } from "~/components/comment-form";
import { CommentList } from "~/components/comment-list";
import { DeliveryActions } from "~/components/delivery-actions";
import { FavoriteButton } from "~/components/favorite-button";
import { ReportDialog } from "~/components/report-dialog";
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
import { listVisibleComments } from "~/services/comments/comments.server";
import { isFavorited } from "~/services/engagement/favorites.server";
import { createServices } from "~/services/create-services.server";
import { getOptionalUser } from "~/services/identity.server";
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

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const slug = params.slug ?? "";
  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  const messages = getMessages(locale);
  const env = context.cloudflare.env;
  const { marketplace } = createServices(env);
  const theme = await marketplace.getTheme(slug, locale);
  if (!theme) {
    throw new Response("Not Found", { status: 404 });
  }

  const related = await marketplace.getRelatedThemes(slug, locale, 5);
  const user = await getOptionalUser(request, env);
  const favorited = user
    ? await isFavorited(env.DB, user.id, theme.id)
    : false;
  const comments = await listVisibleComments(env.DB, theme.id);

  // Theme author id for hide control (best-effort query).
  const authorRow = await env.DB.prepare(
    `SELECT author_id FROM themes WHERE id = ? LIMIT 1`,
  )
    .bind(theme.id)
    .first<{ author_id: string }>();
  const isThemeAuthor = Boolean(
    user && authorRow && user.id === authorRow.author_id,
  );

  const url = new URL(request.url);
  const resume = url.searchParams.get("resume");
  const draft = url.searchParams.get("draft") ?? "";
  const reportReason = url.searchParams.get("reason") ?? "";
  const reported = url.searchParams.get("reported") === "1";

  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    origin: env.APP_ORIGIN,
    messages,
    theme,
    related,
    userId: user?.id ?? null,
    favorited,
    comments,
    isThemeAuthor,
    resumeCopyPrompt: resume === "copy_prompt",
    resumeComment: resume === "comment",
    resumeReport: resume === "report",
    draftComment: draft,
    reportReason,
    reported,
  };
}

export default function ThemeDetailPage({ loaderData }: Route.ComponentProps) {
  const {
    locale,
    messages,
    theme,
    related,
    userId,
    favorited,
    comments,
    isThemeAuthor,
    resumeCopyPrompt,
    resumeComment,
    resumeReport,
    draftComment,
    reportReason,
    reported,
  } = loaderData;
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
        <div className="theme-detail__actions">
          <DeliveryActions
            locale={locale}
            slug={theme.slug}
            labels={{
              download: messages.actions.download,
              copyPrompt: messages.actions.copyPrompt,
            }}
            resumeCopyPrompt={resumeCopyPrompt}
          />
          <FavoriteButton
            locale={locale}
            themeId={theme.id}
            slug={theme.slug}
            initialFavorited={favorited}
            labels={{
              add: messages.community.addFavorite,
              remove: messages.community.removeFavorite,
            }}
          />
        </div>
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

      <CommentList
        locale={locale}
        slug={theme.slug}
        themeId={theme.id}
        comments={comments}
        currentUserId={userId}
        isThemeAuthor={isThemeAuthor}
        labels={{
          heading: messages.community.comments,
          empty: messages.community.commentsEmpty,
          deleted: messages.community.commentDeleted,
          delete: messages.community.commentDelete,
          hide: messages.community.commentHide,
        }}
      />

      <CommentForm
        locale={locale}
        slug={theme.slug}
        themeId={theme.id}
        draft={resumeComment ? draftComment : ""}
        signedIn={Boolean(userId)}
        labels={{
          heading: messages.community.comments,
          placeholder: messages.community.commentPlaceholder,
          submit: messages.community.commentSubmit,
          signInToComment: messages.community.signInToComment,
        }}
      />

      {reported ? (
        <p role="status">{messages.community.reportedThanks}</p>
      ) : null}

      <ReportDialog
        locale={locale}
        themeId={theme.id}
        slug={theme.slug}
        open={resumeReport}
        defaultReason={reportReason || undefined}
        labels={{
          heading: messages.community.report,
          reason: messages.community.reportReason,
          details: messages.community.reportDetails,
          submit: messages.community.reportSubmit,
          reasons: {
            copyright: messages.community.reportReasonCopyright,
            sexual_content: messages.community.reportReasonSexual,
            harassment: messages.community.reportReasonHarassment,
            malware_or_unsafe: messages.community.reportReasonMalware,
            spam: messages.community.reportReasonSpam,
            other: messages.community.reportReasonOther,
          },
        }}
      />

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
