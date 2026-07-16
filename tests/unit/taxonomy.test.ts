import { describe, expect, it } from "vitest";
import { normalizeTaxonomyInput } from "~/domain/taxonomy/normalize";

describe("normalizeTaxonomyInput", () => {
  it("maps English science-fiction synonyms to the canonical key", () => {
    expect(normalizeTaxonomyInput("sci fi")).toBe("science-fiction");
    expect(normalizeTaxonomyInput("sci-fi")).toBe("science-fiction");
    expect(normalizeTaxonomyInput("Sci-Fi")).toBe("science-fiction");
    expect(normalizeTaxonomyInput("science fiction")).toBe("science-fiction");
    expect(normalizeTaxonomyInput("science-fiction")).toBe("science-fiction");
  });

  it("maps localized science-fiction synonyms", () => {
    expect(normalizeTaxonomyInput("科幻")).toBe("science-fiction");
  });

  it("maps seed-aligned style and mode synonyms", () => {
    expect(normalizeTaxonomyInput("cyber")).toBe("neon");
    expect(normalizeTaxonomyInput("synthwave")).toBe("neon");
    expect(normalizeTaxonomyInput("霓虹")).toBe("neon");
    expect(normalizeTaxonomyInput("赛博")).toBe("neon");
    expect(normalizeTaxonomyInput("minimal")).toBe("minimal");
    expect(normalizeTaxonomyInput("clean")).toBe("minimal");
    expect(normalizeTaxonomyInput("night")).toBe("dark");
    expect(normalizeTaxonomyInput("深色")).toBe("dark");
  });

  it("maps bright to energetic only (not light mode)", () => {
    expect(normalizeTaxonomyInput("bright")).toBe("energetic");
    expect(normalizeTaxonomyInput("Bright")).toBe("energetic");
  });

  it("normalizes whitespace and case for lookup", () => {
    expect(normalizeTaxonomyInput("  SCI   FI  ")).toBe("science-fiction");
    expect(normalizeTaxonomyInput("Deep Work")).toBe("focus");
  });

  it("rejects unknown or free-form upload suggestions", () => {
    expect(normalizeTaxonomyInput("totally-new-tag")).toBeNull();
    expect(normalizeTaxonomyInput("")).toBeNull();
    expect(normalizeTaxonomyInput("   ")).toBeNull();
    expect(normalizeTaxonomyInput("cyberpunk-xyz")).toBeNull();
  });
});
