import { expect, test, type Page } from "@playwright/test";

/**
 * Creator pipeline browser flow.
 *
 * Skipped by default: requires a local auth fixture / staging OAuth wiring that
 * is not enabled in this worktree. Prefer fixture auth over DEV_AUTH_BYPASS.
 */
async function signInFixtureUser(_page: Page): Promise<void> {
  throw new Error(
    "signInFixtureUser is not implemented locally; requires auth fixture / staging",
  );
}

async function fillCreatorForm(
  page: Page,
  options: { platforms: string[]; file: string },
): Promise<void> {
  await page.getByLabel("Name").fill("Creator Pipeline Theme");
  await page
    .getByLabel("Description")
    .fill(
      "A deterministic static theme used to verify the creator pipeline e2e path.",
    );
  await page.getByLabel("Slug").fill(`creator-pipeline-${Date.now()}`);
  await page
    .getByLabel("I declare I have the rights to publish this media")
    .check();

  // Clear defaults then apply requested platforms.
  const macos = page.getByRole("checkbox", { name: "macOS" });
  const windows = page.getByRole("checkbox", { name: "Windows" });
  if (await macos.isChecked()) await macos.uncheck();
  if (await windows.isChecked()) await windows.uncheck();
  if (options.platforms.includes("macos")) await macos.check();
  if (options.platforms.includes("windows")) await windows.check();

  // File is selected after draft creation in the current upload UX.
  void options.file;
}

test.describe("creator pipeline", () => {
  // requires local auth fixture / staging
  test.skip("creator uploads static theme, waits for processing, publishes, versions, and unlists", async ({
    page,
  }) => {
    await signInFixtureUser(page);
    await page.goto("/en/upload");
    await fillCreatorForm(page, {
      platforms: ["macos", "windows"],
      file: "tests/fixtures/media/neon-road.png",
    });
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText("Package ready")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Public")).toBeVisible();
    await page.getByRole("button", { name: "Create new version" }).click();
    await expect(page.getByText("Version 2")).toBeVisible();
    await page.getByRole("button", { name: "Unlist" }).click();
    await expect(page.getByText("Unlisted")).toBeVisible();
  });
});
