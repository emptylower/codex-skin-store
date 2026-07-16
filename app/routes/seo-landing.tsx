import { Breadcrumbs } from "~/components/breadcrumbs";
import { isModeratorOrAdmin } from "~/domain/moderation/policy";
import {
  htmlLang,
  localePath,
  parseLocale,
  type Locale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getOptionalUser } from "~/services/identity.server";
import {
  assertFiltersDoNotCreateLandings,
  getLandingBySlug,
} from "~/services/seo/landings.server";
import { buildBasicMeta } from "~/services/seo/meta";
import {
  absoluteUrl,
  buildBreadcrumbList,
  buildItemList,
} from "~/services/seo/structured-data";
import { buildLandingHreflang } from "~/services/seo/translations.server";
import type { Route } from "./+types/seo-landing";

export function meta({ data }: Route.MetaArgs) {
  if (!data || data.notFound) {
    return [
      { title: "Not found · Codex Skin Store" },
      { name: "robots", content: "noindex,nofollow" },
    ];
  }

  return [
    ...buildBasicMeta({
      title: `${data.seoTitle} · Codex Skin Store`,
      description: data.seoDescription || data.intro.slice(0, 160),
      origin: data.origin,
      canonicalPath: data.canonicalPath,
      indexable: data.indexable,
      ogType: "website",
      structuredData: data.structuredData,
    }),
    ...data.hreflangLinks.map((link) => ({
      tagName: "link" as const,
      rel: "alternate",
      hrefLang: link.hreflang,
      href: link.href,
    })),
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  assertFiltersDoNotCreateLandings();

  const locale = parseLocale(params.locale ?? "");
  const slug = params.slug ?? "";
  if (!locale || !slug || slug.length > 80) {
    throw new Response("Not Found", { status: 404 });
  }

  const env = context.cloudflare.env;
  const view = await getLandingBySlug(env.DB, slug, locale);
  const user = await getOptionalUser(request, env);
  const preview =
    user && isModeratorOrAdmin(String((user as { role?: string }).role ?? ""));

  if (!view || view.policy === "not_found") {
    throw new Response("Not Found", { status: 404 });
  }

  // Unapproved registry entries: 404 public, noindex preview for staff.
  if (view.landing.indexStatus !== "approved" && !preview) {
    throw new Response("Not Found", { status: 404 });
  }

  const statuses: Partial<
    Record<Locale, "draft" | "reviewed" | "stale" | "missing">
  > = {};
  for (const loc of ["en", "zh-hans"] as Locale[]) {
    const alt = await getLandingBySlug(env.DB, slug, loc);
    statuses[loc] = alt?.translationStatus ?? "missing";
  }

  const themes = await env.DB.prepare(
    `SELECT th.slug, tr.name
     FROM themes th
     JOIN theme_translations tr ON tr.theme_id = th.id AND tr.locale = ?
     WHERE th.visibility = 'public'
       AND th.moderation_status != 'removed'
       AND th.package_status = 'ready'
     ORDER BY th.updated_at DESC
     LIMIT 24`,
  )
    .bind(locale)
    .all<{ slug: string; name: string }>();

  const origin = env.APP_ORIGIN;
  const canonicalPath = localePath(locale, `/l/${slug}`);
  const themeItems = (themes.results ?? []).map((t) => ({
    name: t.name,
    path: localePath(locale, `/themes/${t.slug}`),
  }));

  const structuredData = [
    buildItemList({
      name: view.title,
      url: absoluteUrl(origin, canonicalPath),
      items: themeItems.map((item) => ({
        name: item.name,
        url: absoluteUrl(origin, item.path),
      })),
    }),
    buildBreadcrumbList(origin, [
      { name: "Home", path: localePath(locale) },
      { name: view.title, path: canonicalPath },
    ]),
  ];

  const hreflangLinks = buildLandingHreflang({
    origin,
    slug,
    statuses,
  }).map((link) => ({
    hreflang: link.hreflang,
    href: link.href,
  }));

  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    origin,
    slug,
    title: view.title,
    intro: view.intro,
    faq: view.faq,
    seoTitle: view.seoTitle,
    seoDescription: view.seoDescription,
    indexable: view.indexable && view.landing.indexStatus === "approved",
    canonicalPath,
    statuses,
    hreflangLinks,
    themeItems,
    structuredData,
    preview: Boolean(preview && view.landing.indexStatus !== "approved"),
    notFound: false as const,
  };
}

export default function SeoLanding({ loaderData }: Route.ComponentProps) {
  const { locale, title, intro, faq, themeItems, preview, canonicalPath } =
    loaderData;

  return (
    <main className="seo-landing" data-testid="seo-landing">
      <Breadcrumbs
        items={[
          { label: "Home", href: localePath(locale) },
          { label: title, href: canonicalPath },
        ]}
      />
      {preview ? (
        <p className="seo-landing__preview" data-testid="seo-landing-preview">
          Staff preview — not publicly indexable.
        </p>
      ) : null}
      <header>
        <h1>{title}</h1>
        {intro ? <p className="seo-landing__intro">{intro}</p> : null}
      </header>

      <section>
        <h2>Themes</h2>
        <ul className="seo-landing__themes">
          {themeItems.map((item) => (
            <li key={item.path}>
              <a href={item.path}>{item.name}</a>
            </li>
          ))}
        </ul>
      </section>

      {faq.length > 0 ? (
        <section>
          <h2>FAQ</h2>
          <dl>
            {faq.map((item, index) => (
              <div key={index}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </main>
  );
}
