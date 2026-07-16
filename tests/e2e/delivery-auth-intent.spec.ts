import { test } from "@playwright/test";

/**
 * Delivery + auth-intent browser flows require a local auth fixture / staging
 * OAuth session. Prefer workers integration tests for gated paths until the
 * fixture is wired (see creator-pipeline.spec.ts).
 */
test.describe("delivery auth intent", () => {
  test.skip("anonymous download creates intent, OAuth returns file stream", async () => {
    // requires local auth fixture / staging
  });

  test.skip("copy prompt after OAuth requires confirmation button (no auto clipboard)", async () => {
    // requires local auth fixture / staging
  });

  test.skip("favorite/comment/report resume after sign-in", async () => {
    // requires local auth fixture / staging
  });

  test.skip("expired or replayed intent is denied", async () => {
    // requires local auth fixture / staging
  });
});
