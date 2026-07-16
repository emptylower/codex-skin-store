import { describe, expect, it } from "vitest";

import {
  assertReciprocal,
  buildHreflangParity,
  localeIndexPolicy,
  shouldEmitAlternate,
} from "~/domain/seo/hreflang";

describe("hreflang parity", () => {
  it("emits self, reciprocal, and x-default for reviewed en + zh-hans", () => {
    const links = buildHreflangParity({
      origin: "https://store.test",
      pathsByLocale: {
        en: "/en/l/soft-dark",
        "zh-hans": "/zh-hans/l/soft-dark",
      },
      indexableByLocale: { en: true, "zh-hans": true },
    });

    expect(links.map((l) => l.hreflang)).toEqual(
      expect.arrayContaining(["en", "zh-Hans", "x-default"]),
    );
    expect(links.find((l) => l.hreflang === "x-default")?.href).toBe(
      "https://store.test/en/l/soft-dark",
    );
    expect(assertReciprocal(links)).toBe(true);
  });

  it("does not claim Chinese alternate when draft/stale/missing", () => {
    for (const status of ["draft", "stale", "missing"] as const) {
      expect(shouldEmitAlternate(status)).toBe(false);
      const links = buildHreflangParity({
        origin: "https://store.test",
        pathsByLocale: {
          en: "/en/l/soft-dark",
          "zh-hans": "/zh-hans/l/soft-dark",
        },
        indexableByLocale: {
          en: true,
          "zh-hans": shouldEmitAlternate(status),
        },
      });
      expect(links.some((l) => l.hreflang === "zh-Hans")).toBe(false);
    }
  });

  it("maps draft/stale to noindex and missing to not_found", () => {
    expect(localeIndexPolicy("reviewed")).toBe("index");
    expect(localeIndexPolicy("draft")).toBe("noindex");
    expect(localeIndexPolicy("stale")).toBe("noindex");
    expect(localeIndexPolicy("missing")).toBe("not_found");
  });
});
