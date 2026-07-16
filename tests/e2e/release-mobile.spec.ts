import { test } from "@playwright/test";

/**
 * Mobile layout/no-overlap checks at 390×844.
 * Skipped as heavy visual suite; community-mobile.spec.ts covers core paths.
 */
test.describe.skip("release mobile", () => {
  test("no overlapping interactive controls on core routes", async () => {
    // Skipped: visual/layout matrix deferred for MVP local gate without auth fixture.
  });
});
