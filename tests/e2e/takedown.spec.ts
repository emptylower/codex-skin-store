import { test } from "@playwright/test";

/**
 * Takedown form E2E needs rate-limit + file upload fixtures.
 * Covered by unit/integration takedown tests.
 */
test.describe.skip("copyright takedown e2e", () => {
  test("submits claim form", async () => {
    // Skipped: abuse gate / Turnstile not wired for Playwright authless upload.
  });
});
