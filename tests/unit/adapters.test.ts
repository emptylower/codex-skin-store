import { describe, expect, it } from "vitest";

import { buildMacosAdapter } from "~/domain/themes/adapters/macos-v1";
import { buildWindowsAdapter } from "~/domain/themes/adapters/windows-v1";

const baseColors = {
  accent: "#FF00AA",
  accentStrong: "#FF33BB",
  accentSoft: "#FF99DD",
  accentFaint: "#FFCCEE",
  accentRgb: "255, 0, 170",
  highlight: "#00FFCC",
  secondary: "#110022",
  text: "#F5F5FF",
  textRgb: "245, 245, 255",
  muted: "#8899AA",
  canvas: "#050510",
  sidebar: "#0A0A18",
  surface: "#12122A",
  surfaceAlt: "#1A1A34",
  surfaceSolid: "#12122A",
  elevated: "#1E1E3A",
  control: "#2A2A4A",
  mainSurface: "#0E0E20",
  line: "#334455",
  heavyLine: "#556677",
  grid: "#223344",
  codeBackground: "#080812",
  buttonText: "#FFFFFF",
};

const adapterFixture = {
  slug: "neon-road",
  name: "Neon Road",
  description: "A high-contrast night drive shell.",
  backgroundFilename: "background.png",
  appearance: "dark" as const,
  backgroundPosition: "center 40%",
  heroOverlay: "rgba(0,0,0,0.35)",
  pageOverlay: "rgba(0,0,0,0.25)",
  homeOverlay: "rgba(0,0,0,0.40)",
  titleShadow: "0 2px 12px rgba(0,0,0,0.6)",
  ...baseColors,
};

describe("runtime adapters", () => {
  it("builds a distinct macOS adapter with colors.panelAlt and no layout", () => {
    const mac = buildMacosAdapter(adapterFixture);
    expect(mac).toHaveProperty("colors.panelAlt");
    expect(mac).not.toHaveProperty("layout");
    expect(mac).toMatchObject({
      schemaVersion: 1,
      id: "neon-road",
      brandSubtitle: "NEON ROAD",
      statusText: "THEME ONLINE",
      image: "background.png",
      colors: {
        panelAlt: baseColors.surfaceAlt,
        accent: baseColors.accent,
      },
    });
    expect(mac).not.toHaveProperty("palette");
    expect(mac).not.toHaveProperty("preview");
  });

  it("builds a distinct Windows adapter with layout.previewPosition", () => {
    const win = buildWindowsAdapter(adapterFixture);
    expect(win).toHaveProperty("layout.previewPosition");
    expect(win).toMatchObject({
      schemaVersion: 1,
      id: "neon-road",
      preview: "preview.jpg",
      mode: "dark",
      brand: "NEON ROAD",
      layout: {
        previewPosition: "center 40%",
        heroPosition: "center 40%",
      },
      palette: {
        accent: baseColors.accent,
        shadowRgb: "0, 0, 0",
      },
    });
    expect(win).not.toHaveProperty("colors");
    expect(win).not.toHaveProperty("panelAlt");
    expect(win).not.toHaveProperty("statusText");
  });

  it("keeps macOS and Windows adapter shapes non-interchangeable", () => {
    const mac = buildMacosAdapter(adapterFixture);
    const win = buildWindowsAdapter(adapterFixture);
    const macKeys = Object.keys(mac).sort();
    const winKeys = Object.keys(win).sort();
    expect(macKeys).not.toEqual(winKeys);
    expect("colors" in mac && !("colors" in win)).toBe(true);
    expect("layout" in win && !("layout" in mac)).toBe(true);
    expect("palette" in win && !("palette" in mac)).toBe(true);
  });
});
