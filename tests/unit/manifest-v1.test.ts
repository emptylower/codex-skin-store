import { describe, expect, it } from "vitest";

import { MACOS_TARGET, WINDOWS_TARGET } from "~/domain/themes/compatibility";
import {
  buildManifest,
  manifestV1Schema,
  serializeManifest,
  type BuildManifestInput,
} from "~/domain/themes/manifest-v1";

const shaA = "a".repeat(64);
const shaB = "b".repeat(64);

export const manifestFixture: BuildManifestInput = {
  id: "theme-1",
  slug: "neon-road",
  version: 1,
  sourceLocale: "en",
  name: "Neon Road",
  description:
    "A high-contrast night drive shell for long coding sessions after dark.",
  creator: { id: "user-1", handle: "neon" },
  license: "CC0-1.0",
  attribution: "",
  sourceUrl: "",
  platforms: ["macos", "windows"],
  appearance: "dark",
  mediaType: "static",
  accent: "#FF00AA",
  secondary: "#110022",
  highlight: "#00FFCC",
  focalPoint: { x: 0.5, y: 0.4 },
  assets: {
    background: {
      filename: "background.png",
      mime: "image/png",
      bytes: 1200,
      width: 1920,
      height: 1080,
      sha256: shaA,
    },
    preview: {
      filename: "preview.jpg",
      mime: "image/jpeg",
      bytes: 800,
      width: 1280,
      height: 720,
      sha256: shaB,
    },
  },
  generatedAt: "2026-07-16T12:00:00.000Z",
};

describe("manifest v1", () => {
  it("builds a dual-platform static neutral manifest", () => {
    const manifest = buildManifest(manifestFixture);
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      id: "theme-1",
      slug: "neon-road",
      version: 1,
      platforms: ["macos", "windows"],
    });
    expect(manifest.compatibilityTargets).toEqual([
      MACOS_TARGET,
      WINDOWS_TARGET,
    ]);
    expect(manifestV1Schema.parse(manifest)).toEqual(manifest);
  });

  it("builds macos-only and windows-only manifests", () => {
    const mac = buildManifest({
      ...manifestFixture,
      platforms: ["macos"],
    });
    expect(mac.platforms).toEqual(["macos"]);
    expect(mac.compatibilityTargets).toEqual([MACOS_TARGET]);

    const win = buildManifest({
      ...manifestFixture,
      platforms: ["windows"],
    });
    expect(win.platforms).toEqual(["windows"]);
    expect(win.compatibilityTargets).toEqual([WINDOWS_TARGET]);
  });

  it("never emits macOS for animated / GIF packages", () => {
    const animated = buildManifest({
      ...manifestFixture,
      mediaType: "animated",
      platforms: ["windows"],
      assets: {
        ...manifestFixture.assets,
        background: {
          filename: "background.gif",
          mime: "image/gif",
          bytes: 4096,
          width: 800,
          height: 600,
          sha256: shaA,
        },
      },
    });
    expect(animated.platforms).toEqual(["windows"]);
    expect(animated.compatibilityTargets).toEqual([WINDOWS_TARGET]);
    expect(animated.platforms).not.toContain("macos");

    // Even if a caller incorrectly includes macos, animated resolution drops it.
    const coerced = buildManifest({
      ...manifestFixture,
      mediaType: "animated",
      platforms: ["macos", "windows"],
    });
    expect(coerced.platforms).toEqual(["windows"]);
    expect(coerced.compatibilityTargets).toEqual([WINDOWS_TARGET]);
  });

  it("serializes with recursively sorted keys and a trailing newline", () => {
    const manifest = buildManifest(manifestFixture);
    const json = serializeManifest(manifest);
    expect(json.endsWith("\n")).toBe(true);
    expect(json).toBe(
      `${JSON.stringify(JSON.parse(json), null, 0)}\n`.replace(
        // rebuild via sorted keys through serialize again for stability check
        JSON.stringify(JSON.parse(json)),
        JSON.stringify(JSON.parse(serializeManifest(manifest))),
      ),
    );
    // Keys at top level are sorted alphabetically.
    const withoutNl = json.slice(0, -1);
    const parsed = JSON.parse(withoutNl) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(Object.keys(parsed).sort());
    expect(Object.keys(parsed.assets as object)).toEqual(
      Object.keys(parsed.assets as object).sort(),
    );
    // Deterministic: same input => same bytes.
    expect(serializeManifest(manifest)).toBe(json);
  });
});
