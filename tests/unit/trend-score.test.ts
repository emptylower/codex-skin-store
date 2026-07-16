import { describe, expect, it } from "vitest";

import {
  ageDaysFromCreated,
  computeTrendScore,
} from "~/domain/engagement/trend";

describe("computeTrendScore", () => {
  it("weights deliveries, favorites, and freshness", () => {
    expect(
      computeTrendScore({
        recentUniqueDeliveries: 3,
        recentFavorites: 4,
        ageDays: 2,
      }),
    ).toBe(3 * 5 + 4 * 2 + Math.max(0, 14 - 2));
  });

  it("drops freshness after 14 days and floors negatives", () => {
    expect(
      computeTrendScore({
        recentUniqueDeliveries: 0,
        recentFavorites: 0,
        ageDays: 20,
      }),
    ).toBe(0);
    expect(
      computeTrendScore({
        recentUniqueDeliveries: -1,
        recentFavorites: -2,
        ageDays: 0,
      }),
    ).toBe(14);
  });
});

describe("ageDaysFromCreated", () => {
  it("computes whole days", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(ageDaysFromCreated(0, day * 3 + 100)).toBe(3);
  });
});
