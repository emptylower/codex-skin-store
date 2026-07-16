import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 5173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    // Chromium only — keep install surface small (npx playwright install chromium).
    ...devices["Desktop Chrome"],
  },
  webServer: {
    // Migrate + seed before boot so the first e2e request always has catalog data.
    command: `npm run db:migrate:local && npm run db:seed:local && PORT=${port} npm run dev -- --port ${port}`,
    // Health-check an actual SSR route (not just the origin) so the server is ready.
    url: `${baseURL}/en`,
    // CI=1 forces a fresh server; local may reuse. Prefer false under CI for reliability.
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "no-js",
      use: {
        javaScriptEnabled: false,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
