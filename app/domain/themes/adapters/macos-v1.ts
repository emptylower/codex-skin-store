/**
 * Distinct macOS original runtime adapter shape.
 * Must never mirror the Windows Forge adapter layout.
 */

export type MacosAdapterInput = {
  slug: string;
  name: string;
  description: string;
  backgroundFilename: string;
  canvas: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  highlight: string;
  secondary: string;
  accentStrong: string;
  text: string;
  muted: string;
  line: string;
};

export type MacosAdapterV1 = {
  schemaVersion: 1;
  id: string;
  name: string;
  brandSubtitle: string;
  tagline: string;
  projectPrefix: string;
  projectLabel: string;
  statusText: string;
  quote: string;
  image: string;
  colors: {
    background: string;
    panel: string;
    panelAlt: string;
    accent: string;
    accentAlt: string;
    secondary: string;
    highlight: string;
    text: string;
    muted: string;
    line: string;
  };
};

export function buildMacosAdapter(v: MacosAdapterInput): MacosAdapterV1 {
  return {
    schemaVersion: 1,
    id: v.slug,
    name: v.name,
    brandSubtitle: v.name.toUpperCase(),
    tagline: v.description,
    projectPrefix: "Select project · ",
    projectLabel: "Select project",
    statusText: "THEME ONLINE",
    quote: v.name,
    image: v.backgroundFilename,
    colors: {
      background: v.canvas,
      panel: v.surface,
      panelAlt: v.surfaceAlt,
      accent: v.accent,
      accentAlt: v.highlight,
      secondary: v.secondary,
      highlight: v.accentStrong,
      text: v.text,
      muted: v.muted,
      line: v.line,
    },
  };
}
