import { test } from "@playwright/test";

/**
 * Security header / CSRF / role-bypass browser checks.
 * Skipped without authenticated admin fixture and stable preview baseURL.
 * Unit/route tests cover same-origin and role policy.
 */
test.describe.skip("release security", () => {
  test("blocks cross-origin admin posts and redacts errors", async () => {
    // Skipped: requires live server + auth fixture.
  });
});
