import { createElement } from "react";
import { env } from "cloudflare:workers";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MACOS_TARGET,
  WINDOWS_TARGET,
  type CreatorInput,
} from "~/domain/themes/creator-input";
import * as identity from "~/services/identity.server";
import { createDraft } from "~/services/creator-themes.server";
import {
  action as editAction,
  loader as editLoader,
  default as EditThemePage,
} from "~/routes/themes.$slug.edit";
import { loader as artifactLoader } from "~/routes/api.creator-artifacts.$themeId.$version.$artifact";

const NOW = 1_700_610_000_000;

const baseInput: CreatorInput = {
  sourceLocale: "en",
  name: "Lifecycle Theme",
  description:
    "Creator lifecycle route fixture with enough description characters.",
  slug: "lifecycle-theme",
  license: "CC0-1.0",
  attribution: "",
  sourceUrl: "",
  platforms: ["macos", "windows"],
  appearance: "dark",
  mediaType: "static",
  accent: "#112233",
  secondary: "#445566",
  highlight: "#778899",
  focalPoint: { x: 0.5, y: 0.5 },
  compatibilityTargets: [MACOS_TARGET, WINDOWS_TARGET],
  rightsDeclared: true,
};

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

async function insertUser(id: string, handle: string) {
  await env.DB.prepare(
    `INSERT INTO users (
       id, handle, display_name, bio, role, upload_status,
       email_verified, deletion_status, created_at, updated_at
     ) VALUES (?, ?, ?, '', 'user', 'active', 0, 'active', ?, ?)
     ON CONFLICT(id) DO UPDATE SET handle = excluded.handle`,
  )
    .bind(id, handle, handle, NOW, NOW)
    .run();
}

async function markReady(themeId: string, version: number) {
  const packageKey = `themes/${themeId}/versions/${version}/generated/theme.zip`;
  await env.DB.prepare(
    `UPDATE theme_versions
     SET generation_state = 'ready',
         package_key = ?,
         payload_digest = 'payload-route',
         archive_digest = 'archive-route',
         archive_bytes = 1024,
         preview_key = ?,
         manifest_key = ?,
         macos_adapter_key = ?,
         windows_adapter_key = ?,
         install_key = ?,
         prompt_key = ?,
         updated_at = ?
     WHERE theme_id = ? AND version = ?`,
  )
    .bind(
      packageKey,
      `themes/${themeId}/versions/${version}/generated/preview.jpg`,
      `themes/${themeId}/versions/${version}/generated/manifest.json`,
      `themes/${themeId}/versions/${version}/generated/adapters/macos/theme.json`,
      `themes/${themeId}/versions/${version}/generated/adapters/windows/theme.json`,
      `themes/${themeId}/versions/${version}/generated/INSTALL.md`,
      `themes/${themeId}/versions/${version}/generated/install-prompt.md`,
      NOW,
      themeId,
      version,
    )
    .run();

  // Seed package object for publish HEAD checks.
  await env.PACKAGES.put(packageKey, new Uint8Array([1, 2, 3, 4]), {
    customMetadata: {
      "payload-digest": "payload-route",
      "archive-digest": "archive-route",
    },
  });

  // Seed artifact bodies for the creator artifact route.
  const artifacts: Array<[string, string, string]> = [
    [
      `themes/${themeId}/versions/${version}/generated/preview.jpg`,
      "image/jpeg",
      "preview-bytes",
    ],
    [
      `themes/${themeId}/versions/${version}/generated/manifest.json`,
      "application/json",
      '{"ok":true}',
    ],
    [
      `themes/${themeId}/versions/${version}/generated/adapters/macos/theme.json`,
      "application/json",
      '{"platform":"macos"}',
    ],
    [
      `themes/${themeId}/versions/${version}/generated/adapters/windows/theme.json`,
      "application/json",
      '{"platform":"windows"}',
    ],
    [
      `themes/${themeId}/versions/${version}/generated/INSTALL.md`,
      "text/markdown; charset=utf-8",
      "# Install",
    ],
    [
      `themes/${themeId}/versions/${version}/generated/install-prompt.md`,
      "text/markdown; charset=utf-8",
      "# Prompt",
    ],
  ];
  for (const [key, contentType, body] of artifacts) {
    await env.PACKAGES.put(key, body, {
      httpMetadata: { contentType },
    });
  }
}

describe("creator lifecycle routes", () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM package_jobs`).run();
    await env.DB.prepare(`DELETE FROM source_uploads`).run();
    await env.DB.prepare(`DELETE FROM theme_translations`).run();
    await env.DB.prepare(`DELETE FROM theme_versions`).run();
    await env.DB.prepare(`DELETE FROM themes`).run();
    await insertUser("u1", "lifecycle-author");
    await insertUser("u2", "other-user");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects unauthenticated edit page visitors to sign-in", async () => {
    const request = new Request("https://store.test/en/themes/x/edit");
    await expect(
      editLoader({
        request,
        params: { locale: "en", slug: "x" },
        context: cloudflareContext(),
        unstable_pattern: "/:locale/themes/:slug/edit",
        unstable_url: new URL(request.url),
      } as never),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof Response)) return false;
      if (error.status !== 302 && error.status !== 303) return false;
      const location = error.headers.get("Location") ?? "";
      return location.endsWith("/en/auth/sign-in");
    });
  });

  it("loads edit page for owner with generation state and actions", async () => {
    vi.spyOn(identity, "requireUser").mockResolvedValue({
      id: "u1",
      name: "Author",
      email: "a@test",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const draft = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      baseInput,
    );
    await markReady(draft.themeId, 1);

    const request = new Request(
      `https://store.test/en/themes/${draft.slug}/edit`,
    );
    const data = await editLoader({
      request,
      params: { locale: "en", slug: draft.slug },
      context: cloudflareContext(),
      unstable_pattern: "/:locale/themes/:slug/edit",
      unstable_url: new URL(request.url),
    } as never);

    expect(data).toMatchObject({
      theme: {
        themeId: draft.themeId,
        slug: draft.slug,
        visibility: "draft",
      },
    });
    expect(data.versions[0]).toMatchObject({
      version: 1,
      generationState: "ready",
    });

    const html = renderToStaticMarkup(
      createElement(EditThemePage, {
        loaderData: data,
        params: { locale: "en", slug: draft.slug },
      } as never),
    );
    expect(html).toContain("Publish");
    expect(html).toContain("Create new version");
    expect(html).toContain("ready");
    expect(html.toLowerCase()).toContain("macos");
  });

  it("publishes and unlists via edit actions", async () => {
    vi.spyOn(identity, "requireUser").mockResolvedValue({
      id: "u1",
      name: "Author",
      email: "a@test",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const draft = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      { ...baseInput, slug: "action-theme" },
    );
    await markReady(draft.themeId, 1);

    const publishRequest = new Request(
      `https://store.test/en/themes/action-theme/edit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          intent: "publish",
          version: "1",
        }).toString(),
      },
    );
    const publishResult = await editAction({
      request: publishRequest,
      params: { locale: "en", slug: "action-theme" },
      context: cloudflareContext(),
      unstable_pattern: "/:locale/themes/:slug/edit",
      unstable_url: new URL(publishRequest.url),
    } as never);

    expect(publishResult).toMatchObject({
      ok: true,
      visibility: "public",
    });

    const theme = await env.DB.prepare(
      `SELECT visibility, current_version FROM themes WHERE id = ?`,
    )
      .bind(draft.themeId)
      .first<{ visibility: string; current_version: number }>();
    expect(theme).toMatchObject({
      visibility: "public",
      current_version: 1,
    });

    const unlistRequest = new Request(
      `https://store.test/en/themes/action-theme/edit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ intent: "unlist" }).toString(),
      },
    );
    const unlistResult = await editAction({
      request: unlistRequest,
      params: { locale: "en", slug: "action-theme" },
      context: cloudflareContext(),
      unstable_pattern: "/:locale/themes/:slug/edit",
      unstable_url: new URL(unlistRequest.url),
    } as never);
    expect(unlistResult).toMatchObject({ ok: true, visibility: "unlisted" });
  });

  it("serves author-only artifacts with private no-store headers", async () => {
    vi.spyOn(identity, "requireUser").mockResolvedValue({
      id: "u1",
      name: "Author",
      email: "a@test",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const draft = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      { ...baseInput, slug: "artifact-theme" },
    );
    await markReady(draft.themeId, 1);

    const request = new Request(
      `https://store.test/api/creator-artifacts/${draft.themeId}/1/manifest`,
    );
    const response = await artifactLoader({
      request,
      params: {
        themeId: draft.themeId,
        version: "1",
        artifact: "manifest",
      },
      context: cloudflareContext(),
      unstable_pattern: "/api/creator-artifacts/:themeId/:version/:artifact",
      unstable_url: new URL(request.url),
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(await response.text()).toContain('"ok":true');
  });

  it("rejects non-author artifact access and unknown artifact names", async () => {
    vi.spyOn(identity, "requireUser").mockResolvedValue({
      id: "u2",
      name: "Other",
      email: "o@test",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const draft = await createDraft(
      { db: env.DB, userId: "u1", now: () => NOW },
      { ...baseInput, slug: "artifact-forbidden" },
    );
    await markReady(draft.themeId, 1);

    await expect(
      artifactLoader({
        request: new Request(
          `https://store.test/api/creator-artifacts/${draft.themeId}/1/preview`,
        ),
        params: {
          themeId: draft.themeId,
          version: "1",
          artifact: "preview",
        },
        context: cloudflareContext(),
        unstable_pattern: "/api/creator-artifacts/:themeId/:version/:artifact",
        unstable_url: new URL(
          `https://store.test/api/creator-artifacts/${draft.themeId}/1/preview`,
        ),
      } as never),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof Response && error.status === 403,
    );

    vi.spyOn(identity, "requireUser").mockResolvedValue({
      id: "u1",
      name: "Author",
      email: "a@test",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    await expect(
      artifactLoader({
        request: new Request(
          `https://store.test/api/creator-artifacts/${draft.themeId}/1/theme.zip`,
        ),
        params: {
          themeId: draft.themeId,
          version: "1",
          artifact: "theme.zip",
        },
        context: cloudflareContext(),
        unstable_pattern: "/api/creator-artifacts/:themeId/:version/:artifact",
        unstable_url: new URL(
          `https://store.test/api/creator-artifacts/${draft.themeId}/1/theme.zip`,
        ),
      } as never),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof Response && error.status === 404,
    );
  });
});
