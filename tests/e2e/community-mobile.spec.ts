import { expect, test } from "@playwright/test";

test.describe("community mobile layout", () => {
  test("theme detail delivery actions are present on public pages", async ({
    page,
  }, testInfo) => {
    // Layout smoke without auth fixture: public seed themes expose actions.
    test.skip(
      testInfo.project.name === "no-js" && false,
      "layout works without JS",
    );

    await page.goto("/en");
    const firstCard = page.getByTestId("theme-card").first().getByRole("link");
    if ((await firstCard.count()) === 0) {
      test.skip(true, "no seeded themes for layout smoke");
      return;
    }
    await firstCard.click();
    await expect(page.getByTestId("delivery-actions")).toBeVisible();
    await expect(page.getByTestId("download-theme")).toBeVisible();
    await expect(page.getByTestId("favorite-button")).toBeVisible();
    await expect(page.getByTestId("report-dialog")).toBeVisible();
  });
});
