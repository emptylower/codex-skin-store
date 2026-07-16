import { test } from "@playwright/test";

/**
 * Full axe-core accessibility scan across locales/viewports.
 * Skipped until @axe-core/playwright is installed and public routes are stable under authless CI.
 * Install pin when enabling: @axe-core/playwright@4.12.1
 *
 * Covered partially by tests/e2e/accessibility.spec.ts and unit route SSR tests.
 */
test.describe.skip("release accessibility", () => {
  test("core routes pass axe at 390x844 and 1440x900", async () => {
    // Skipped: axe + dual-locale matrix deferred; run scripts/release-check.ts --skip-e2e for other gates.
  });
});
