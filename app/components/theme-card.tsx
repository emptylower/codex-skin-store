import type { Locale } from "~/i18n/config";
import { localePath } from "~/i18n/config";
import type { Messages } from "~/i18n/messages";
import type { ThemeListItem } from "~/services/marketplace/types";
import { safeMediaUrl } from "~/utils/safe-media-url";

export type ThemeCardProps = {
  theme: ThemeListItem;
  labels: Messages["theme"];
  filterLabels: Messages["filters"];
  locale?: Locale;
};

function numberLocale(locale: Locale | undefined): string {
  if (locale === "zh-hans") return "zh-CN";
  return "en";
}

function formatCount(value: number, locale?: Locale): string {
  return new Intl.NumberFormat(numberLocale(locale), {
    notation: "compact",
  }).format(value);
}

export function ThemeCard({
  theme,
  labels,
  filterLabels,
  locale,
}: ThemeCardProps) {
  const mediaSrc = safeMediaUrl(theme.previewImage ?? theme.coverImage);
  const href = locale ? localePath(locale, `/themes/${theme.slug}`) : undefined;

  return (
    <article className="theme-card" data-testid="theme-card">
      {href ? (
        <a href={href} className="theme-card__link">
          <ThemeCardBody
            theme={theme}
            labels={labels}
            filterLabels={filterLabels}
            locale={locale}
            mediaSrc={mediaSrc}
          />
        </a>
      ) : (
        <ThemeCardBody
          theme={theme}
          labels={labels}
          filterLabels={filterLabels}
          locale={locale}
          mediaSrc={mediaSrc}
        />
      )}
    </article>
  );
}

function ThemeCardBody({
  theme,
  labels,
  filterLabels,
  locale,
  mediaSrc,
}: ThemeCardProps & { mediaSrc: string | null }) {
  return (
    <>
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
        <h3 className="theme-card__title">{theme.name}</h3>
        <p className="theme-card__creator">
          <span className="theme-card__creator-label">{labels.by}</span>{" "}
          <span>{theme.creator.displayName}</span>
        </p>
        <ul className="theme-card__meta">
          <li>
            <span className="theme-card__meta-label">
              {filterLabels.platform}
            </span>
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
            {labels.favorites}: {formatCount(theme.favoritesCount, locale)}
          </span>
          <span>
            {labels.downloads}: {formatCount(theme.downloadsCount, locale)}
          </span>
        </p>
      </div>
    </>
  );
}
