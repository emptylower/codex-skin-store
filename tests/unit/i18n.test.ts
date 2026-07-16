import { describe, expect, it } from "vitest";
import { parseLocale, localePath } from "~/i18n/config";

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
});
