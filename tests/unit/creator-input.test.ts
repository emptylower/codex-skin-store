import { describe, expect, it } from "vitest";

import {
  creatorInputSchema,
  MACOS_TARGET,
  WINDOWS_TARGET,
  type CreatorInput,
} from "~/domain/themes/creator-input";

export const validCreatorInput: CreatorInput = {
  sourceLocale: "en",
  name: "Neon Road",
  description:
    "A high-contrast night drive shell for long coding sessions after dark.",
  slug: "neon-road-draft",
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
  compatibilityTargets: [MACOS_TARGET, WINDOWS_TARGET],
  rightsDeclared: true,
};

describe("creatorInputSchema", () => {
  it("accepts a complete static dual-platform input", () => {
    const parsed = creatorInputSchema.parse(validCreatorInput);
    expect(parsed.slug).toBe("neon-road-draft");
    expect(parsed.platforms).toEqual(["macos", "windows"]);
  });

  it("trims and lowercases the slug", () => {
    const parsed = creatorInputSchema.parse({
      ...validCreatorInput,
      slug: "  Neon-Road-Draft  ",
    });
    expect(parsed.slug).toBe("neon-road-draft");
  });

  it("requires animated media to be windows-only", () => {
    const result = creatorInputSchema.safeParse({
      ...validCreatorInput,
      mediaType: "animated",
      platforms: ["macos", "windows"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("platforms")),
      ).toBe(true);
    }

    const ok = creatorInputSchema.safeParse({
      ...validCreatorInput,
      mediaType: "animated",
      platforms: ["windows"],
      compatibilityTargets: [WINDOWS_TARGET],
    });
    expect(ok.success).toBe(true);
  });

  it("requires attribution for CC-BY-4.0", () => {
    const missing = creatorInputSchema.safeParse({
      ...validCreatorInput,
      license: "CC-BY-4.0",
      attribution: "",
    });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(
        missing.error.issues.some((i) => i.path.includes("attribution")),
      ).toBe(true);
    }

    const ok = creatorInputSchema.safeParse({
      ...validCreatorInput,
      license: "CC-BY-4.0",
      attribution: "Photo by Example",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects non-http(s) source URLs and invalid hex colors", () => {
    expect(
      creatorInputSchema.safeParse({
        ...validCreatorInput,
        sourceUrl: "ftp://example.com/asset.png",
      }).success,
    ).toBe(false);

    expect(
      creatorInputSchema.safeParse({
        ...validCreatorInput,
        accent: "ff00aa",
      }).success,
    ).toBe(false);

    expect(
      creatorInputSchema.safeParse({
        ...validCreatorInput,
        sourceUrl: "https://example.com/asset.png",
      }).success,
    ).toBe(true);
  });

  it("requires rightsDeclared true and at least one platform", () => {
    expect(
      creatorInputSchema.safeParse({
        ...validCreatorInput,
        rightsDeclared: false,
      }).success,
    ).toBe(false);

    expect(
      creatorInputSchema.safeParse({
        ...validCreatorInput,
        platforms: [],
      }).success,
    ).toBe(false);
  });

  it("rejects short names/descriptions and invalid slugs", () => {
    expect(
      creatorInputSchema.safeParse({
        ...validCreatorInput,
        name: "A",
      }).success,
    ).toBe(false);

    expect(
      creatorInputSchema.safeParse({
        ...validCreatorInput,
        description: "too short",
      }).success,
    ).toBe(false);

    expect(
      creatorInputSchema.safeParse({
        ...validCreatorInput,
        slug: "Bad_Slug",
      }).success,
    ).toBe(false);
  });
});
