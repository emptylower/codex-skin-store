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
  // List items do not carry full manifest; provide sensible defaults for SSR demo.
  // Theme detail will supply full palette/focal later.
  void theme;
  return {
    palette: {
      bg: "#0f172a",
      fg: "#f8fafc",
      accent: "#38bdf8",
      muted: "#94a3b8",
    },
    focalPoint: { x: 0.5, y: 0.4 },
    overlay: 0.35,
  };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) {
    return [{ title: "Codex Skin Store" }];
  }

  const title = `Codex Skin Store · ${data.messages.marketplace.heading}`;
  const tags: Array<
    | { title: string }
    | { name: string; content: string }
  > = [
    { title },
    {
      name: "description",
      content: data.messages.marketplace.description,
    },
  ];

  if (data.filterError || (data.filters && hasActiveFilters(data.filters))) {
    tags.push({ name: "robots", content: "noindex,follow" });
  }

  return tags;
}

function hasActiveFilters(filters: MarketplaceFilters): boolean {
  return Boolean(
    filters.q ||
      filters.platform ||
      filters.mode ||
      filters.media ||
      filters.taxonomy.length > 0 ||
      (filters.sort && filters.sort !== "trending"),
  );
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
      filters: null,
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
        <nav className="marketplace__nav" aria-label="Primary">
          <span>{messages.nav.explore}</span>
          <span>{messages.nav.upload}</span>
        </nav>
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
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
