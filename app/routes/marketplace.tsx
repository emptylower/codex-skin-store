import { FilterBar } from "~/components/filter-bar";
import { ThemeCard } from "~/components/theme-card";
import { ThemePreview } from "~/components/theme-preview/theme-preview";
import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import { createServices } from "~/services/create-services.server";
import {
  marketplaceFilterSchema,
  type MarketplaceFilters,
  type ThemeListItem,
} from "~/services/marketplace/types";
import { isIndexableMarketplace } from "~/services/seo/index-policy";
import {
  buildBasicMeta,
  localeRootAlternates,
} from "~/services/seo/meta.server";
import type { Route } from "./+types/marketplace";

function emptyToUndefined(value: string | null): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseTaxonomy(searchParams: URLSearchParams): string[] {
  const repeated = searchParams.getAll("taxonomy");
  if (repeated.length > 0) {
    return repeated
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
  }
  const single = searchParams.get("taxonomy");
  if (!single) return [];
  return single
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseFiltersFromSearchParams(
  searchParams: URLSearchParams,
): MarketplaceFilters | null {
  const raw = {
    q: emptyToUndefined(searchParams.get("q")),
    platform: emptyToUndefined(searchParams.get("platform")),
    mode: emptyToUndefined(searchParams.get("mode")),
    media: emptyToUndefined(searchParams.get("media")),
    sort: emptyToUndefined(searchParams.get("sort")),
    taxonomy: parseTaxonomy(searchParams),
  };

  const parsed = marketplaceFilterSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

/**
 * Loose form defaults when strict filter validation fails.
 * Keeps attempted values in the filter bar so Apply doesn't wipe user input.
 */
function formDefaultsFromSearchParams(
  searchParams: URLSearchParams,
): MarketplaceFilters {
  const platform = emptyToUndefined(searchParams.get("platform"));
  const mode = emptyToUndefined(searchParams.get("mode"));
  const media = emptyToUndefined(searchParams.get("media"));
  const sort = emptyToUndefined(searchParams.get("sort"));

  return {
    q: emptyToUndefined(searchParams.get("q")),
    platform:
      platform === "macos" || platform === "windows" || platform === "both"
        ? platform
        : undefined,
    mode: mode === "light" || mode === "dark" ? mode : undefined,
    media: media === "static" || media === "animated" ? media : undefined,
    sort:
      sort === "trending" || sort === "newest" || sort === "downloads"
        ? sort
        : "trending",
    taxonomy: parseTaxonomy(searchParams).slice(0, 4).map((t) => t.slice(0, 40)),
  };
}

function readPreviewExtras(theme: ThemeListItem): {
  palette?: {
    bg?: string;
    fg?: string;
    accent?: string;
    muted?: string;
  };
  focalPoint?: { x: number; y: number };
  overlay?: number;
} {
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

  const title = `Codex Skin Store · ${data.messages.marketplace.heading}`;
  const description = data.messages.marketplace.description;
  const canonicalPath = localePath(data.locale);
  const indexable =
    !data.filterError && isIndexableMarketplace(data.filters);

  return buildBasicMeta({
    title,
    description,
    origin: data.origin,
    // Filtered / invalid query pages still canonicalize to the locale root.
    canonicalPath,
    indexable,
    alternates: indexable ? localeRootAlternates() : undefined,
    ogType: "website",
  });
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const messages = getMessages(locale);
  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  const url = new URL(request.url);
  const filters = parseFiltersFromSearchParams(url.searchParams);

  if (!filters) {
    return {
      ...localeData,
      origin: context.cloudflare.env.APP_ORIGIN,
      messages,
      themes: [] as ThemeListItem[],
      filterError: true as const,
      // Strict validation failed; still surface safe form defaults for the bar.
      filters: formDefaultsFromSearchParams(url.searchParams),
    };
  }

  const { marketplace } = createServices(context.cloudflare.env);
  const result = await marketplace.listThemes(locale, filters);

  return {
    ...localeData,
    origin: context.cloudflare.env.APP_ORIGIN,
    messages,
    themes: result.items,
    filterError: false as const,
    filters,
  };
}

export default function Marketplace({ loaderData }: Route.ComponentProps) {
  const { locale, messages, themes, filterError, filters } = loaderData;
  const featured = themes[0] ?? null;
  const previewExtras = featured ? readPreviewExtras(featured) : null;

  return (
    <main className="marketplace">
      <header className="marketplace__header">
        <div className="marketplace__brand">
          <span className="marketplace__brand-text">{messages.nav.explore}</span>
        </div>
        <h1>{messages.marketplace.heading}</h1>
        <p className="marketplace__lede">{messages.marketplace.lede}</p>
      </header>

      <section className="marketplace__filters" aria-label={messages.filters.heading}>
        <FilterBar
          filters={filters}
          labels={messages.filters}
          action={localePath(locale)}
        />
        {filterError ? (
          <p className="marketplace__filter-error" role="status">
            {messages.marketplace.filterError}
          </p>
        ) : null}
      </section>

      {featured && previewExtras ? (
        <section
          className="marketplace__simulator"
          aria-label={messages.marketplace.simulator}
        >
          <h2 className="marketplace__section-title">
            {messages.marketplace.simulator}
          </h2>
          <ThemePreview
            theme={{
              name: featured.name,
              coverImage: featured.coverImage,
              previewImage: featured.previewImage,
              mode: featured.mode,
              platform: featured.platform,
              ...previewExtras,
            }}
            labels={messages.preview}
          />
        </section>
      ) : null}

      <section
        className="marketplace__grid-section"
        aria-label={messages.marketplace.grid}
      >
        <h2 className="marketplace__section-title">{messages.marketplace.grid}</h2>
        {themes.length === 0 ? (
          <p className="marketplace__empty">{messages.marketplace.empty}</p>
        ) : (
          <ul className="marketplace__grid">
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
