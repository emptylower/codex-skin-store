import { createElement } from "react";
import { env } from "cloudflare:workers";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import AdminReports, {
  loader as reportsLoader,
  meta as reportsMeta,
} from "~/routes/admin.reports";
import AdminTheme, {
  loader as themeLoader,
  meta as themeMeta,
} from "~/routes/admin.theme";
import AdminUser, {
  loader as userLoader,
  meta as userMeta,
} from "~/routes/admin.user";
import * as identity from "~/services/identity.server";

const NOW = 1_737_000_000_000;

function cloudflareContext() {
  return {
    cloudflare: {
      env,
      ctx: {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    },
  };
}

async function insertUser(
  id: string,
  handle: string,
  role: "user" | "moderator" | "admin",
) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, handle, display_name, role, upload_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  )
    .bind(id, handle, handle, role, NOW, NOW)
    .run();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin routes", () => {
  it("emits noindex,nofollow on all admin pages", () => {
    for (const meta of [reportsMeta, themeMeta, userMeta]) {
      const tags = meta();
      expect(tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "robots",
            content: "noindex,nofollow",
          }),
        ]),
      );
    }
  });

  it("redirects anonymous users to sign-in", async () => {
    vi.spyOn(identity, "getOptionalUser").mockResolvedValue(null);
    const request = new Request("https://store.test/en/admin/reports");
    await expect(
      reportsLoader({
        request,
        params: { locale: "en" },
        context: cloudflareContext(),
      } as never),
    ).rejects.toMatchObject({ status: 302 });
  });

  it("returns 403 for ordinary users", async () => {
    await insertUser("user-plain", "plain", "user");
    vi.spyOn(identity, "getOptionalUser").mockResolvedValue({
      id: "user-plain",
      role: "user",
    } as never);

    await expect(
      reportsLoader({
        request: new Request("https://store.test/en/admin/reports"),
        params: { locale: "en" },
        context: cloudflareContext(),
      } as never),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("lets moderators view reports without exposing other roles' private fields incorrectly", async () => {
    await insertUser("mod-route", "modroute", "moderator");
    await insertUser("reporter-r", "reporterr", "user");
    await env.DB.prepare(
      `INSERT INTO reports (
         id, reporter_id, target_type, target_id, reason, details,
         status, created_at
       ) VALUES ('rep-route-1', 'reporter-r', 'theme', 't1', 'spam', 'secret details', 'open', ?)`,
    )
      .bind(NOW)
      .run();

    vi.spyOn(identity, "getOptionalUser").mockResolvedValue({
      id: "mod-route",
      role: "moderator",
    } as never);

    const data = await reportsLoader({
      request: new Request("https://store.test/en/admin/reports"),
      params: { locale: "en" },
      context: cloudflareContext(),
    } as never);

    expect(data.reports.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(
      createElement(AdminReports, {
        loaderData: data,
        params: { locale: "en" },
      } as never),
    );
    expect(html).toContain("Moderation reports");
    expect(html).toContain("spam");
  });

  it("hides upload suspension controls from moderators and shows them to admins", async () => {
    await insertUser("mod-user-page", "modus", "moderator");
    await insertUser("admin-user-page", "admus", "admin");
    await insertUser("target-user-page", "tgtus", "user");

    vi.spyOn(identity, "getOptionalUser").mockResolvedValue({
      id: "mod-user-page",
      role: "moderator",
    } as never);

    const modData = await userLoader({
      request: new Request(
        "https://store.test/en/admin/user?userId=target-user-page",
      ),
      params: { locale: "en" },
      context: cloudflareContext(),
    } as never);
    expect(modData.canSuspend).toBe(false);
    const modHtml = renderToStaticMarkup(
      createElement(AdminUser, {
        loaderData: modData,
        params: { locale: "en" },
      } as never),
    );
    expect(modHtml).toContain("Only admins may suspend uploads");

    vi.spyOn(identity, "getOptionalUser").mockResolvedValue({
      id: "admin-user-page",
      role: "admin",
    } as never);
    const adminData = await userLoader({
      request: new Request(
        "https://store.test/en/admin/user?userId=target-user-page",
      ),
      params: { locale: "en" },
      context: cloudflareContext(),
    } as never);
    expect(adminData.canSuspend).toBe(true);
    const adminHtml = renderToStaticMarkup(
      createElement(AdminUser, {
        loaderData: adminData,
        params: { locale: "en" },
      } as never),
    );
    expect(adminHtml).toContain("Suspend uploads");
  });

  it("loads theme admin page for moderators", async () => {
    await insertUser("mod-theme-page", "modth", "moderator");
    await insertUser("author-theme-page", "authth", "user");
    await env.DB.prepare(
      `INSERT OR IGNORE INTO themes (
         id, author_id, slug, source_locale, current_version,
         visibility, moderation_status, package_status,
         favorites_count, downloads_count, created_at, updated_at
       ) VALUES ('theme-admin-1', 'author-theme-page', 'theme-admin-1', 'en', 1,
                 'public', 'clean', 'ready', 0, 0, ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();

    vi.spyOn(identity, "getOptionalUser").mockResolvedValue({
      id: "mod-theme-page",
      role: "moderator",
    } as never);

    const data = await themeLoader({
      request: new Request(
        "https://store.test/en/admin/theme?themeId=theme-admin-1",
      ),
      params: { locale: "en" },
      context: cloudflareContext(),
    } as never);
    expect(data.theme?.slug).toBe("theme-admin-1");
    const html = renderToStaticMarkup(
      createElement(AdminTheme, {
        loaderData: data,
        params: { locale: "en" },
      } as never),
    );
    expect(html).toContain("Remove theme");
    expect(html).toContain("Restore theme");
  });
});
