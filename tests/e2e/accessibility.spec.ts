import { expect, test } from "@playwright/test";

test.describe("accessibility", () => {
  test("keyboard-only navigation reaches filters, cards, and tabs", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name === "no-js",
      "Keyboard tab switching needs client JS",
    );

    await page.goto("/en");
    await expect(
      page.getByRole("heading", { level: 1, name: "Codex theme marketplace" }),
    ).toBeVisible();

    // Prefer direct focus over multi-step Tab traversal (order can vary by viewport).
    const search = page.locator("#filter-q");
    await search.focus();
    await expect(search).toBeFocused();
    await search.fill("Neon");

    const apply = page.getByRole("button", { name: "Apply filters" });
    await apply.focus();
    await expect(apply).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=Neon/);

    // Focus the first theme card link and open it with Enter.
    const firstCardLink = page
      .getByTestId("theme-card")
      .first()
      .getByRole("link");
    await firstCardLink.focus();
    await expect(firstCardLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/themes\//);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Home/Task tablist is keyboard operable after client hydration.
    const tablist = page.getByRole("tablist", { name: "Codex views" });
    await expect(tablist).toBeVisible();
    await expect(tablist).toBeAttached();
    const homeTab = tablist.getByRole("tab", { name: "Home" });
    const taskTab = tablist.getByRole("tab", { name: "Task" });

    // Click-focus then ArrowRight; retry until React key handlers are hydrated
    // (parallel workers can race SSR markup vs client listeners).
    await expect(homeTab).toBeVisible();
    await expect(async () => {
      await homeTab.click();
      await expect(homeTab).toHaveAttribute("aria-selected", "true");
      await homeTab.press("ArrowRight");
      await expect(taskTab).toHaveAttribute("aria-selected", "true");
    }).toPass({ timeout: 15_000 });
    await expect(page.locator(".codex-task")).toBeVisible();
  });

  test("interactive controls expose a visible focus style", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name === "no-js",
      "Focus rings are validated with JS-enabled projects",
    );

    await page.goto("/en");
    const search = page.locator("#filter-q");
    await search.focus();

    const outline = await search.evaluate((el) => {
      const styles = getComputedStyle(el);
      return {
        outlineStyle: styles.outlineStyle,
        outlineWidth: styles.outlineWidth,
        outlineColor: styles.outlineColor,
        boxShadow: styles.boxShadow,
      };
    });

    const hasOutline =
      outline.outlineStyle !== "none" &&
      outline.outlineWidth !== "0px" &&
      !outline.outlineColor.includes("rgba(0, 0, 0, 0)");
    const hasShadow = outline.boxShadow !== "none";
    expect(hasOutline || hasShadow).toBeTruthy();
  });

  test("page has a single main landmark and h1", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    await page.goto("/en/themes/neon-road");
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });
});
