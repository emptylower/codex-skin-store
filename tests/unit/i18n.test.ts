import { describe, expect, it } from "vitest";
import {
  htmlLang,
  localePath,
  negotiateLocale,
  parseLocale,
} from "~/i18n/config";

describe("locale config", () => {
  it("accepts only launch locales", () => {
    expect(parseLocale("zh-hans")).toBe("zh-hans");
    expect(parseLocale("fr")).toBeNull();
  });

  it("keeps entity slugs unchanged", () => {
    expect(localePath("zh-hans", "/themes/neon-road")).toBe(
      "/zh-hans/themes/neon-road",
    );
  });

  it("negotiates locale from Accept-Language", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("en-US,en;q=0.9")).toBe("en");
    expect(negotiateLocale("zh-CN,zh;q=0.9")).toBe("zh-hans");
    expect(negotiateLocale("ZH-TW")).toBe("zh-hans");
  });

  it("maps locales to html lang tags", () => {
    expect(htmlLang("zh-hans")).toBe("zh-Hans");
    expect(htmlLang("en")).toBe("en");
  });

  it("avoids trailing slash for empty or root paths", () => {
    expect(localePath("en")).toBe("/en");
    expect(localePath("en", "")).toBe("/en");
    expect(localePath("en", "/")).toBe("/en");
  });
});
