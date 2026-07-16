import type { Messages } from "~/i18n/messages";
import type { MarketplaceFilters } from "~/services/marketplace/types";

export type FilterBarProps = {
  filters: MarketplaceFilters | null;
  labels: Messages["filters"];
  action: string;
};

const PLATFORM_OPTIONS = ["", "macos", "windows", "both"] as const;
const MODE_OPTIONS = ["", "light", "dark"] as const;
const MEDIA_OPTIONS = ["", "static", "animated"] as const;
const SORT_OPTIONS = ["trending", "newest", "downloads"] as const;

function platformLabel(
  value: (typeof PLATFORM_OPTIONS)[number],
  labels: Messages["filters"],
): string {
  if (!value) return labels.any;
  if (value === "macos") return labels.platformMacos;
  if (value === "windows") return labels.platformWindows;
  return labels.platformBoth;
}

function modeLabel(
  value: (typeof MODE_OPTIONS)[number],
  labels: Messages["filters"],
): string {
  if (!value) return labels.any;
  if (value === "light") return labels.modeLight;
  return labels.modeDark;
}

function mediaLabel(
  value: (typeof MEDIA_OPTIONS)[number],
  labels: Messages["filters"],
): string {
  if (!value) return labels.any;
  if (value === "static") return labels.mediaStatic;
  return labels.mediaAnimated;
}

function sortLabel(
  value: (typeof SORT_OPTIONS)[number],
  labels: Messages["filters"],
): string {
  if (value === "trending") return labels.sortTrending;
  if (value === "newest") return labels.sortNewest;
  return labels.sortDownloads;
}

export function FilterBar({ filters, labels, action }: FilterBarProps) {
  const current = filters ?? {
    q: undefined,
    platform: undefined,
    mode: undefined,
    media: undefined,
    taxonomy: [],
    sort: "trending" as const,
  };

  return (
    <form className="filter-bar" method="get" action={action} role="search">
      {current.taxonomy.map((key) => (
        <input key={key} type="hidden" name="taxonomy" value={key} />
      ))}

      <div className="filter-bar__field">
        <label htmlFor="filter-q">{labels.search}</label>
        <input
          id="filter-q"
          type="search"
          name="q"
          defaultValue={current.q ?? ""}
          maxLength={80}
          autoComplete="off"
        />
      </div>

      <div className="filter-bar__field">
        <label htmlFor="filter-platform">{labels.platform}</label>
        <select
          id="filter-platform"
          name="platform"
          defaultValue={current.platform ?? ""}
        >
          {PLATFORM_OPTIONS.map((value) => (
            <option key={value || "any"} value={value}>
              {platformLabel(value, labels)}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-bar__field">
        <label htmlFor="filter-mode">{labels.mode}</label>
        <select id="filter-mode" name="mode" defaultValue={current.mode ?? ""}>
          {MODE_OPTIONS.map((value) => (
            <option key={value || "any"} value={value}>
              {modeLabel(value, labels)}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-bar__field">
        <label htmlFor="filter-media">{labels.media}</label>
        <select
          id="filter-media"
          name="media"
          defaultValue={current.media ?? ""}
        >
          {MEDIA_OPTIONS.map((value) => (
            <option key={value || "any"} value={value}>
              {mediaLabel(value, labels)}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-bar__field">
        <label htmlFor="filter-sort">{labels.sort}</label>
        <select
          id="filter-sort"
          name="sort"
          defaultValue={current.sort ?? "trending"}
        >
          {SORT_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {sortLabel(value, labels)}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-bar__actions">
        <button type="submit">{labels.apply}</button>
      </div>
    </form>
  );
}
