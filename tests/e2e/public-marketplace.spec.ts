import { expect, test, type Page } from "@playwright/test";

const THEME_SLUG = "neon-road";
const THEME_NAME_EN = "Neon Road";
const CREATOR_HANDLE = "nova-chen";
const CREATOR_NAME = "Nova Chen";

async function openMarketplace(page: Page, locale = "en") {
  await page.goto(`/${locale}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.describe("public marketplace flows", () => {
  test("SSR HTML responses include document security headers", async ({
    page,
  }) => {
    const response = await page.goto("/en", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBeTruthy();
    expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response?.headers()["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response?.headers()["permissions-policy"]).toContain("camera=()");
    expect(response?.headers()["content-security-policy"]).toContain(
      "default-src 'self'",
    );
  });

  test("redirects root to negotiated locale", async ({ page }) => {
    const response = await page.goto("/", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/(en|zh-hans)\/?$/);
  });

  test("redirects Chinese Accept-Language to zh-hans", async ({ browser }) => {
    const context = await browser.newContext({
      locale: "zh-CN",
      extraHTTPHeaders: {
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/zh-hans\/?$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Codex 主题市场",
    );
    await context.close();
  });

  test("search and filter reduce the theme grid", async ({ page }) => {
    await openMarketplace(page);

    await page.getByLabel("Search").fill("Neon");
    await page.getByLabel("Mode").selectOption("dark");
    await page.getByRole("button", { name: "Apply filters" }).click();

    await expect(page).toHaveURL(/q=Neon/);
    await expect(page).toHaveURL(/mode=dark/);
    await expect(page.getByTestId("theme-card")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: THEME_NAME_EN }),
    ).toBeVisible();
  });

  test("theme card navigates to detail and creator", async ({ page }) => {
    await openMarketplace(page);

    const card = page.getByTestId("theme-card").filter({
      hasText: THEME_NAME_EN,
    });
    await expect(card).toBeVisible();
    await card.getByRole("link").click();

    await expect(page).toHaveURL(new RegExp(`/en/themes/${THEME_SLUG}`));
    await expect(
      page.getByRole("heading", { level: 1, name: THEME_NAME_EN }),
    ).toBeVisible();
    await expect(page.getByText(/high-contrast dark shell/i)).toBeVisible();

    await page.getByRole("link", { name: CREATOR_NAME }).first().click();
    await expect(page).toHaveURL(new RegExp(`/en/creators/${CREATOR_HANDLE}`));
    await expect(
      page.getByRole("heading", { level: 1, name: CREATOR_NAME }),
    ).toBeVisible();
  });

  test("Home and Task preview tabs switch content", async ({ page }) => {
    test.skip(
      test.info().project.name === "no-js",
      "Tab switching requires client JavaScript",
    );

    await page.goto(`/en/themes/${THEME_SLUG}`);
    await expect(
      page.getByRole("heading", { level: 1, name: THEME_NAME_EN }),
    ).toBeVisible();

    const tablist = page.getByRole("tablist", { name: "Codex views" });
    await expect(tablist).toBeVisible();
    await expect(tablist).toBeAttached();

    const homeTab = tablist.getByRole("tab", { name: "Home" });
    const taskTab = tablist.getByRole("tab", { name: "Task" });

    await expect(homeTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-view="home"]')).toBeVisible();

    // Retry until client hydration attaches click handlers.
    await expect(async () => {
      await taskTab.click();
      await expect(taskTab).toHaveAttribute("aria-selected", "true");
    }).toPass({ timeout: 15_000 });
    await expect(page.locator(".codex-task")).toBeVisible();
    await expect(page.getByText(/Codex · Task/)).toBeVisible();

    await homeTab.click();
    await expect(homeTab).toHaveAttribute("aria-selected", "true", {
      timeout: 15_000,
    });
    await expect(page.locator('[data-view="home"]')).toBeVisible();
  });

  test("unknown theme returns 404", async ({ page }) => {
    const response = await page.goto("/en/themes/does-not-exist-theme");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });

  test("SSR theme content is visible without JavaScript", async ({ page }) => {
    test.skip(
      test.info().project.name !== "no-js",
      "Covered by the dedicated no-js project",
    );

    await page.goto(`/en/themes/${THEME_SLUG}`);
    await expect(
      page.getByRole("heading", { level: 1, name: THEME_NAME_EN }),
    ).toBeVisible();
    await expect(page.getByText(CREATOR_NAME).first()).toBeVisible();
    await expect(page.getByText(/high-contrast dark shell/i)).toBeVisible();
    // Default SSR tab panel is Home
    await expect(page.locator('[data-view="home"]')).toBeVisible();
  });

  test("marketplace heading is visible at project viewport", async ({
    page,
  }) => {
    await openMarketplace(page);
    const heading = page.getByRole("heading", {
      level: 1,
      name: "Codex theme marketplace",
    });
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
  });
});
