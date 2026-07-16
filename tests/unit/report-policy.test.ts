import { describe, expect, it } from "vitest";

import { REPORT_REASONS } from "~/domain/moderation/report-reasons";
import { reportInputSchema } from "~/services/moderation/reports.server";

describe("report policy", () => {
  it("allows only controlled reasons", () => {
    expect(REPORT_REASONS).toEqual([
      "copyright",
      "sexual_content",
      "harassment",
      "malware_or_unsafe",
      "spam",
      "other",
    ]);
  });

  it("validates target and details length", () => {
    expect(
      reportInputSchema.parse({
        targetType: "theme",
        targetId: "t1",
        reason: "spam",
        details: "x".repeat(2000),
      }).reason,
    ).toBe("spam");

    expect(() =>
      reportInputSchema.parse({
        targetType: "theme",
        targetId: "t1",
        reason: "not-a-reason",
      }),
    ).toThrow();

    expect(() =>
      reportInputSchema.parse({
        targetType: "theme",
        targetId: "t1",
        reason: "spam",
        details: "x".repeat(2001),
      }),
    ).toThrow();
  });
});
