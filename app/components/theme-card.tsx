import type { ThemeListItem } from "~/services/marketplace/types";
import type { Messages } from "~/i18n/messages";

export type ThemeCardProps = {
  theme: ThemeListItem;
  labels: Messages["theme"];
  filterLabels: Messages["filters"];
};

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

export function ThemeCard({ theme, labels, filterLabels }: ThemeCardProps) {
  const mediaSrc = theme.previewImage ?? theme.coverImage;

  return (
    <article className="theme-card" data-testid="theme-card">
      <div className="theme-card__media" style={{ aspectRatio: "16 / 10" }}>
        {mediaSrc ? (
          <img
            src={mediaSrc}
            alt=""
            loading="lazy"
            decoding="async"
            className="theme-card__image"
          />
        ) : (
          <div className="theme-card__media-fallback" aria-hidden="true" />
        )}
      </div>
      <div className="theme-card__body">
        <h2 className="theme-card__title">{theme.name}</h2>
        <p className="theme-card__creator">
          <span className="theme-card__creator-label">{labels.by}</span>{" "}
          <span>{theme.creator.displayName}</span>
        </p>
        <ul className="theme-card__meta">
          <li>
            <span className="theme-card__meta-label">{filterLabels.platform}</span>
            <span className="theme-card__meta-value">{theme.platform}</span>
          </li>
          <li>
            <span className="theme-card__meta-label">{filterLabels.mode}</span>
            <span className="theme-card__meta-value">{theme.mode}</span>
          </li>
          <li>
            <span className="theme-card__meta-label">{filterLabels.media}</span>
            <span className="theme-card__meta-value">{theme.media}</span>
          </li>
        </ul>
        <p className="theme-card__counts">
          <span>
            {labels.favorites}: {formatCount(theme.favoritesCount)}
          </span>
          <span>
            {labels.downloads}: {formatCount(theme.downloadsCount)}
          </span>
        </p>
      </div>
    </article>
  );
}
