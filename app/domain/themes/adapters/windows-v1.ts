/**
 * Distinct Forge Windows runtime adapter shape.
 * Must never mirror the macOS original adapter layout.
 */

export type WindowsAdapterInput = {
  slug: string;
  name: string;
  description: string;
  backgroundFilename: string;
  appearance: "light" | "dark";
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentFaint: string;
  accentRgb: string;
  highlight: string;
  secondary: string;
  text: string;
  textRgb: string;
  muted: string;
  canvas: string;
  sidebar: string;
  surface: string;
  surfaceSolid: string;
  elevated: string;
  control: string;
  mainSurface: string;
  line: string;
  heavyLine: string;
  grid: string;
  codeBackground: string;
  buttonText: string;
  backgroundPosition: string;
  heroOverlay: string;
  pageOverlay: string;
  homeOverlay: string;
  titleShadow: string;
};

export type WindowsAdapterV1 = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  image: string;
  preview: string;
  mode: "light" | "dark";
  order: number;
  brand: string;
  palette: {
    accent: string;
    accentStrong: string;
    accentSoft: string;
    accentFaint: string;
    accentRgb: string;
    highlight: string;
    secondary: string;
    ink: string;
    inkRgb: string;
    muted: string;
    canvas: string;
    sidebar: string;
    surface: string;
    surfaceSolid: string;
    elevated: string;
    control: string;
    mainSurface: string;
    line: string;
    heavyLine: string;
    grid: string;
    shadowRgb: string;
    codeBackground: string;
    buttonText: string;
  };
  layout: {
    copyAlign: string;
    copyWidth: string;
    heroPosition: string;
    pagePosition: string;
    previewPosition: string;
    bodyBackground: string;
    heroOverlay: string;
    pageOverlay: string;
    homeOverlay: string;
    titleColor: string;
    titleShadow: string;
  };
};

export function buildWindowsAdapter(v: WindowsAdapterInput): WindowsAdapterV1 {
  return {
    schemaVersion: 1,
    id: v.slug,
    name: v.name,
    description: v.description,
    image: v.backgroundFilename,
    preview: "preview.jpg",
    mode: v.appearance,
    order: 0,
    brand: v.name.toUpperCase(),
    palette: {
      accent: v.accent,
      accentStrong: v.accentStrong,
      accentSoft: v.accentSoft,
      accentFaint: v.accentFaint,
      accentRgb: v.accentRgb,
      highlight: v.highlight,
      secondary: v.secondary,
      ink: v.text,
      inkRgb: v.textRgb,
      muted: v.muted,
      canvas: v.canvas,
      sidebar: v.sidebar,
      surface: v.surface,
      surfaceSolid: v.surfaceSolid,
      elevated: v.elevated,
      control: v.control,
      mainSurface: v.mainSurface,
      line: v.line,
      heavyLine: v.heavyLine,
      grid: v.grid,
      shadowRgb: "0, 0, 0",
      codeBackground: v.codeBackground,
      buttonText: v.buttonText,
    },
    layout: {
      copyAlign: "left",
      copyWidth: "46%",
      heroPosition: v.backgroundPosition,
      pagePosition: v.backgroundPosition,
      previewPosition: v.backgroundPosition,
      bodyBackground: v.canvas,
      heroOverlay: v.heroOverlay,
      pageOverlay: v.pageOverlay,
      homeOverlay: v.homeOverlay,
      titleColor: v.text,
      titleShadow: v.titleShadow,
    },
  };
}
