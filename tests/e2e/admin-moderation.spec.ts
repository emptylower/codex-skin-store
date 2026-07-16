import { test } from "@playwright/test";

/**
 * Full admin moderation E2E requires authenticated moderator/admin fixtures.
 * Covered by tests/routes/admin-routes.test.tsx and integration admin-actions.
 */
test.describe.skip("admin moderation e2e", () => {
  test("remove and restore theme with audit row", async () => {
    // Skipped: no auth fixture for moderator sessions in Playwright yet.
  });
});
