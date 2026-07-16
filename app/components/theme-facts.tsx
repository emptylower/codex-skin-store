import type { Messages } from "~/i18n/messages";
import type { ThemeDetail } from "~/services/marketplace/types";

export type ThemeFactsProps = {
  theme: ThemeDetail;
  labels: Messages["theme"];
  filterLabels: Messages["filters"];
};

function readLicense(manifest: Record<string, unknown>, fallback: string): string {
  const license = manifest.license;
  return typeof license === "string" && license.trim().length > 0
    ? license
    : fallback;
}

function formatFocal(
  preview: ThemeDetail["preview"],
): string | null {
  const x = preview?.focalX;
  const y = preview?.focalY;
  if (typeof x !== "number" && typeof y !== "number") return null;
  const fx = typeof x === "number" ? String(x) : "—";
  const fy = typeof y === "number" ? String(y) : "—";
  return `${fx}, ${fy}`;
}

function formatPalette(preview: ThemeDetail["preview"]): string | null {
  const palette = preview?.palette;
  if (!palette) return null;
  const parts = [palette.bg, palette.fg, palette.accent, palette.muted].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function ThemeFacts({ theme, labels, filterLabels }: ThemeFactsProps) {
  const license = readLicense(theme.manifest, labels.licenseFallback);
  const palette = formatPalette(theme.preview);
  const focal = formatFocal(theme.preview);
  const version =
    theme.currentVersion == null ? "—" : String(theme.currentVersion);

  const facts: Array<{ term: string; value: string }> = [
    { term: labels.compatibility, value: theme.platform },
    { term: filterLabels.mode, value: theme.mode },
    { term: filterLabels.media, value: theme.media },
    { term: labels.license, value: license },
    { term: labels.version, value: version },
  ];

  if (palette) {
    facts.push({ term: labels.palette, value: palette });
  }
  if (focal) {
    facts.push({ term: labels.focal, value: focal });
  }

  return (
    <section className="theme-facts" aria-label={labels.facts}>
      <h2 className="theme-facts__title">{labels.facts}</h2>
      <dl className="theme-facts__list">
        {facts.map((fact) => (
          <div key={fact.term} className="theme-facts__row">
            <dt className="theme-facts__term">{fact.term}</dt>
            <dd className="theme-facts__value">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
