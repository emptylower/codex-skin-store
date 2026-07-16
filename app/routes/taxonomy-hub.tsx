import { Breadcrumbs } from "~/components/breadcrumbs";
import { ThemeCard } from "~/components/theme-card";
import {
  htmlLang,
  localePath,
  locales,
  parseLocale,
  type Locale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import { createServices } from "~/services/create-services.server";
import type { MarketplaceFilters } from "~/services/marketplace/types";
import { isIndexableTaxonomy } from "~/services/seo/index-policy";
import {
  buildBasicMeta,
  taxonomyPath,
  type HreflangAlternate,
} from "~/services/seo/meta";
import {
  buildBreadcrumbList,
  taxonomyBreadcrumbs,
} from "~/services/seo/structured-data";
import type { Route } from "./+types/taxonomy-hub";

type TaxonomyDimension = NonNullable<MarketplaceFilters["taxonomyDimension"]>;

const CONTROLLED_DIMENSIONS = new Set<TaxonomyDimension>([
  "style",
  "mood",
  "mode",
  "media",
  "platform",
]);

function isTaxonomyDimension(value: string): value is TaxonomyDimension {
  return CONTROLLED_DIMENSIONS.has(value as TaxonomyDimension);
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) {
    return [{ title: "Codex Skin Store" }];
  }

  const { taxonomy, locale, origin, messages, themes, availableLocales } = data;
  const canonicalPath = taxonomyPath(locale, taxonomy.dimension, taxonomy.key);
  const title = `${taxonomy.label} · Codex Skin Store`;
  const description = `${taxonomy.label} themes for Codex Desktop.`;
  // Empty hubs must not be indexed.
  const indexable = isIndexableTaxonomy({
    exists: true,
    dimension: taxonomy.dimension,
    key: taxonomy.key,
    publicThemeCount: themes.length,
  });

  // Only emit hreflang where translation exists and inventory > 0.
  const alternates: HreflangAlternate[] = availableLocales.map(
    (code: Locale) => ({
      locale: code,
      path: taxonomyPath(code, taxonomy.dimension, taxonomy.key),
    }),
  );

  const structuredData = [
    buildBreadcrumbList(
      origin,
      taxonomyBreadcrumbs({
        locale,
        homeLabel: messages.breadcrumbs.home,
        label: taxonomy.label,
        path: canonicalPath,
      }),
    ),
  ];

  return buildBasicMeta({
    title,
    description,
    origin,
    canonicalPath,
    indexable,
    alternates: indexable && alternates.length > 0 ? alternates : undefined,
    ogType: "website",
    structuredData,
  });
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const dimension = params.dimension ?? "";
  const key = params.key ?? "";
  if (!dimension || !key || !isTaxonomyDimension(dimension)) {
    throw new Response("Not Found", { status: 404 });
  }

  const messages = getMessages(locale);
  const { marketplace } = createServices(context.cloudflare.env);
  const taxonomy = await marketplace.getTaxonomy(dimension, key, locale);
  if (!taxonomy) {
    throw new Response("Not Found", { status: 404 });
  }

  const { items: themes } = await marketplace.listThemes(locale, {
    taxonomy: [key],
    taxonomyDimension: dimension,
    sort: "trending",
  });

  // Locales with a translation AND at least one public theme are indexable.
  const availableLocales: Locale[] = [];
  for (const code of locales) {
    if (code === locale) {
      if (themes.length > 0) availableLocales.push(code);
      continue;
    }

    const otherTaxonomy = await marketplace.getTaxonomy(dimension, key, code);
    if (!otherTaxonomy) continue;

    const { items } = await marketplace.listThemes(code, {
      taxonomy: [key],
      taxonomyDimension: dimension,
      sort: "trending",
    });
    if (items.length > 0) {
      availableLocales.push(code);
    }
  }

  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    origin: context.cloudflare.env.APP_ORIGIN,
    messages,
    taxonomy,
    themes,
    availableLocales,
  };
}

export default function TaxonomyHubPage({ loaderData }: Route.ComponentProps) {
  const { locale, messages, taxonomy, themes } = loaderData;

  return (
    <main className="taxonomy-hub">
      <Breadcrumbs
        items={[
          { label: messages.breadcrumbs.home, href: localePath(locale) },
          { label: taxonomy.label },
        ]}
      />

      <header className="taxonomy-hub__header">
        <h1>{taxonomy.label}</h1>
        <p className="taxonomy-hub__meta">
          {taxonomy.dimension} / {taxonomy.key}
        </p>
      </header>

      <section
        className="taxonomy-hub__themes"
        aria-label={messages.taxonomy.themes}
      >
        <h2>{messages.taxonomy.themes}</h2>
        {themes.length === 0 ? (
          <p className="taxonomy-hub__empty">{messages.taxonomy.empty}</p>
        ) : (
          <ul className="taxonomy-hub__grid">
            {themes.map((theme) => (
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
