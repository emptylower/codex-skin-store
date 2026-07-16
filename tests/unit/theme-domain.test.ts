import { describe, expect, it } from "vitest";
import {
  canChangeSlug,
  normalizeSlug,
  resolveUniqueSlug,
} from "~/domain/themes/slug";
import {
  canDownload,
  isPubliclyListable,
  type ThemeState,
} from "~/domain/themes/state";

const readyPublic: ThemeState = {
  visibility: "public",
  moderationStatus: "clean",
  packageStatus: "ready",
};

describe("normalizeSlug", () => {
  it("lowercases and replaces non-alphanumeric runs with a single hyphen", () => {
    expect(normalizeSlug("Neon Road")).toBe("neon-road");
    expect(normalizeSlug("Sci Fi!! Shell")).toBe("sci-fi-shell");
    expect(normalizeSlug("  Hello___World  ")).toBe("hello-world");
  });

  it("strips diacritics to ASCII", () => {
    expect(normalizeSlug("Café Noël")).toBe("cafe-noel");
    expect(normalizeSlug(" naïve ")).toBe("naive");
  });

  it("trims leading and trailing hyphens", () => {
    expect(normalizeSlug("---Neon---")).toBe("neon");
    expect(normalizeSlug("***glow***")).toBe("glow");
  });

  it("caps length at 60 characters", () => {
    const long = "a".repeat(80);
    expect(normalizeSlug(long)).toHaveLength(60);
    expect(normalizeSlug(long)).toBe("a".repeat(60));
  });

  it("rejects empty results after normalization", () => {
    expect(() => normalizeSlug("")).toThrow();
    expect(() => normalizeSlug("!!!")).toThrow();
    expect(() => normalizeSlug("---")).toThrow();
  });
});

describe("resolveUniqueSlug", () => {
  it("returns the base slug when available", () => {
    expect(resolveUniqueSlug("neon-road", () => false)).toBe("neon-road");
  });

  it("suffixes from -2 through -99 on collisions", () => {
    const taken = new Set(["neon-road", "neon-road-2", "neon-road-3"]);
    expect(resolveUniqueSlug("neon-road", (slug) => taken.has(slug))).toBe(
      "neon-road-4",
    );
  });

  it("keeps suffixed candidates within 60 chars for a max-length base", () => {
    const base = "a".repeat(60);
    const taken = new Set([base]);
    const resolved = resolveUniqueSlug(base, (slug) => taken.has(slug));

    expect(resolved).toHaveLength(60);
    expect(resolved.endsWith("-2")).toBe(true);
    expect(resolved).toBe(`${"a".repeat(58)}-2`);
  });

  it("truncates base further for multi-digit suffixes near the length cap", () => {
    const base = "b".repeat(60);
    const taken = new Set([base]);
    for (let n = 2; n <= 9; n += 1) {
      const suffix = `-${n}`;
      taken.add(`${"b".repeat(60 - suffix.length)}${suffix}`);
    }
    const resolved = resolveUniqueSlug(base, (slug) => taken.has(slug));

    // "-10" is 3 chars → base truncated to 57 so total stays ≤ 60
    expect(resolved).toHaveLength(60);
    expect(resolved).toBe(`${"b".repeat(57)}-10`);
  });

  it("throws after base-99 is exhausted", () => {
    const exists = (slug: string) =>
      slug === "taken" || /^taken-\d+$/.test(slug);
    expect(() => resolveUniqueSlug("taken", exists)).toThrow();
  });
});

describe("canChangeSlug", () => {
  it("allows changes for unpublished drafts", () => {
    expect(canChangeSlug({ visibility: "draft", currentVersion: null })).toBe(
      true,
    );
  });

  it("locks slugs once a version has been published", () => {
    expect(canChangeSlug({ visibility: "draft", currentVersion: 1 })).toBe(
      false,
    );
    expect(canChangeSlug({ visibility: "public", currentVersion: 1 })).toBe(
      false,
    );
  });

  it("locks slugs for non-draft visibility even without a version", () => {
    expect(canChangeSlug({ visibility: "public", currentVersion: null })).toBe(
      false,
    );
    expect(
      canChangeSlug({ visibility: "unlisted", currentVersion: null }),
    ).toBe(false);
    expect(canChangeSlug({ visibility: "hidden", currentVersion: null })).toBe(
      false,
    );
  });
});

describe("theme public eligibility", () => {
  it("allows download for public clean ready themes", () => {
    expect(canDownload(readyPublic)).toBe(true);
  });

  it("blocks download when moderation status is removed", () => {
    expect(
      canDownload({
        visibility: "public",
        moderationStatus: "removed",
        packageStatus: "ready",
      }),
    ).toBe(false);
  });

  it("blocks download unless visibility is public and package is ready", () => {
    expect(
      canDownload({
        visibility: "unlisted",
        moderationStatus: "clean",
        packageStatus: "ready",
      }),
    ).toBe(false);
    expect(
      canDownload({
        visibility: "public",
        moderationStatus: "clean",
        packageStatus: "processing",
      }),
    ).toBe(false);
    expect(
      canDownload({
        visibility: "public",
        moderationStatus: "flagged",
        packageStatus: "ready",
      }),
    ).toBe(true);
  });

  it("lists only public, non-removed, ready themes", () => {
    expect(isPubliclyListable(readyPublic)).toBe(true);
    expect(
      isPubliclyListable({
        visibility: "public",
        moderationStatus: "removed",
        packageStatus: "ready",
      }),
    ).toBe(false);
    expect(
      isPubliclyListable({
        visibility: "unlisted",
        moderationStatus: "clean",
        packageStatus: "ready",
      }),
    ).toBe(false);
    expect(
      isPubliclyListable({
        visibility: "public",
        moderationStatus: "clean",
        packageStatus: "failed",
      }),
    ).toBe(false);
  });
});
