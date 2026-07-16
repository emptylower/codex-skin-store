import type { MarketplaceFilters } from "~/services/marketplace/types";
import type { Messages } from "~/i18n/messages";

export type FilterBarProps = {
  filters: MarketplaceFilters | null;
  labels: Messages["filters"];
  action: string;
};

const PLATFORM_OPTIONS = ["", "macos", "windows", "both"] as const;
const MODE_OPTIONS = ["", "light", "dark"] as const;
const MEDIA_OPTIONS = ["", "static", "animated"] as const;
const SORT_OPTIONS = ["trending", "newest", "downloads"] as const;

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
              {value ? value : labels.any}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-bar__field">
        <label htmlFor="filter-mode">{labels.mode}</label>
        <select id="filter-mode" name="mode" defaultValue={current.mode ?? ""}>
          {MODE_OPTIONS.map((value) => (
            <option key={value || "any"} value={value}>
              {value ? value : labels.any}
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
              {value ? value : labels.any}
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
              {value}
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
