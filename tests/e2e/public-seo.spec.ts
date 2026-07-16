import { expect, test, type Page } from "@playwright/test";

const ORIGIN = "http://localhost:5173";

function parseLinkTags(html: string): Array<{
  rel: string;
  href: string;
  hreflang?: string;
}> {
  const links: Array<{ rel: string; href: string; hreflang?: string }> = [];
  const re = /<link\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const rel = /rel=["']([^"']+)["']/i.exec(attrs)?.[1];
    const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!rel || !href) continue;
    const hreflang = /hreflang=["']([^"']+)["']/i.exec(attrs)?.[1];
    links.push(hreflang ? { rel, href, hreflang } : { rel, href });
  }
  return links;
}

async function pageSource(page: Page): Promise<string> {
  // Prefer raw HTTP body so meta is available even without JS hydration.
  const url = page.url();
  const response = await page.request.get(url);
  return response.text();
}

test.describe("public SEO tags", () => {
  test("marketplace emits canonical and bilingual hreflang", async ({
    page,
  }) => {
    await page.goto("/en");
    const html = await pageSource(page);
    const links = parseLinkTags(html);

    const canonical = links.find((link) => link.rel === "canonical");
    expect(canonical?.href).toBe(`${ORIGIN}/en`);

    const alternates = links.filter((link) => link.rel === "alternate");
    const byLang = Object.fromEntries(
      alternates
        .filter((link) => link.hreflang)
        .map((link) => [link.hreflang!, link.href]),
    );

    expect(byLang.en).toBe(`${ORIGIN}/en`);
    expect(byLang["zh-Hans"]).toBe(`${ORIGIN}/zh-hans`);
    expect(byLang["x-default"]).toBe(`${ORIGIN}/en`);
  });

  test("theme detail canonical and hreflang point at theme paths", async ({
    page,
  }) => {
    await page.goto("/en/themes/neon-road");
    const html = await pageSource(page);
    const links = parseLinkTags(html);

    const canonical = links.find((link) => link.rel === "canonical");
    expect(canonical?.href).toBe(`${ORIGIN}/en/themes/neon-road`);

    const alternates = links.filter((link) => link.rel === "alternate");
    const byLang = Object.fromEntries(
      alternates
        .filter((link) => link.hreflang)
        .map((link) => [link.hreflang!, link.href]),
    );

    expect(byLang.en).toBe(`${ORIGIN}/en/themes/neon-road`);
    expect(byLang["zh-Hans"]).toBe(`${ORIGIN}/zh-hans/themes/neon-road`);
    expect(byLang["x-default"]).toBe(`${ORIGIN}/en/themes/neon-road`);
  });

  test("filtered marketplace still canonicalizes to locale root", async ({
    page,
  }) => {
    await page.goto("/en?q=Neon&mode=dark");
    const html = await pageSource(page);
    const links = parseLinkTags(html);
    const canonical = links.find((link) => link.rel === "canonical");
    expect(canonical?.href).toBe(`${ORIGIN}/en`);
  });

  test("robots.txt and sitemap.xml are crawlable", async ({ page }) => {
    const robots = await page.request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();
    const robotsBody = await robots.text();
    expect(robotsBody).toMatch(
      /Sitemap:\s*http:\/\/localhost:5173\/sitemap\.xml/i,
    );

    const sitemap = await page.request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    const sitemapBody = await sitemap.text();
    expect(sitemapBody).toContain(`${ORIGIN}/en`);
    expect(sitemapBody).toContain(`${ORIGIN}/en/themes/neon-road`);
  });
});
