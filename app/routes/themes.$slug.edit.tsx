import { redirect } from "react-router";

import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import { requireUser } from "~/services/identity.server";
import {
  createVersion,
  CreatorThemeError,
  getCreatorThemeBySlug,
  publishTheme,
  retryFailedVersion,
  unlistTheme,
  updateDraftMetadata,
  type CreatorThemeDetail,
} from "~/services/creator-themes.server";
import type { Route } from "./+types/themes.$slug.edit";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: "Edit theme · Codex Skin Store" }];
  return [
    { title: `Edit ${data.theme.slug} · Codex Skin Store` },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

function packagesFromEnv(env: Env) {
  return env.PACKAGES;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request, context.cloudflare.env);
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      throw redirect(localePath(locale, "/auth/sign-in"));
    }
    throw error;
  }

  const slug = params.slug ?? "";
  try {
    const theme = await getCreatorThemeBySlug(context.cloudflare.env.DB, {
      userId: user.id,
      slug,
    });
    const messages = getMessages(locale);
    const localeData: LocaleLoaderData = {
      locale,
      htmlLang: htmlLang(locale),
    };
    return {
      ...localeData,
      title: messages.nav.upload,
      theme,
      versions: theme.versions,
      error: null as string | null,
    };
  } catch (error) {
    if (error instanceof CreatorThemeError) {
      if (error.code === "not_found") {
        throw new Response("Not Found", { status: 404 });
      }
      if (error.code === "forbidden") {
        throw new Response("Forbidden", { status: 403 });
      }
    }
    throw error;
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const user = await requireUser(request, context.cloudflare.env);
  const slug = params.slug ?? "";
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const env = context.cloudflare.env;
  const deps = { db: env.DB, packages: packagesFromEnv(env) };

  try {
    const theme = await getCreatorThemeBySlug(env.DB, {
      userId: user.id,
      slug,
    });

    if (intent === "publish") {
      const version = Number(form.get("version"));
      const result = await publishTheme(deps, {
        userId: user.id,
        themeId: theme.themeId,
        version,
      });
      return {
        ok: true as const,
        visibility: result.visibility,
        currentVersion: result.currentVersion,
        error: null as string | null,
      };
    }

    if (intent === "unlist") {
      const result = await unlistTheme(deps, {
        userId: user.id,
        themeId: theme.themeId,
      });
      return {
        ok: true as const,
        visibility: result.visibility,
        error: null as string | null,
      };
    }

    if (intent === "create-version") {
      const latest = theme.versions[0];
      const base = latest?.creatorInput;
      if (!base) {
        return { ok: false as const, error: "missing_creator_input" };
      }
      // Optional field overrides from form; fall back to last version input.
      const raw = {
        ...base,
        name: String(form.get("name") || base.name),
        description: String(form.get("description") || base.description),
        slug: theme.slug,
      };
      const created = await createVersion(deps, {
        userId: user.id,
        themeId: theme.themeId,
        input: raw,
      });
      return {
        ok: true as const,
        version: created.version,
        error: null as string | null,
      };
    }

    if (intent === "update-metadata") {
      const latest = theme.versions[0];
      const base = latest?.creatorInput;
      if (!base) {
        return { ok: false as const, error: "missing_creator_input" };
      }
      const platforms = form.getAll("platforms").map(String);
      const compatibilityTargets = form
        .getAll("compatibilityTargets")
        .map(String);
      const raw = {
        ...base,
        name: String(form.get("name") ?? base.name),
        description: String(form.get("description") ?? base.description),
        slug: String(form.get("slug") ?? theme.slug),
        platforms: platforms.length ? platforms : base.platforms,
        compatibilityTargets: compatibilityTargets.length
          ? compatibilityTargets
          : base.compatibilityTargets,
      };
      const updated = await updateDraftMetadata(deps, {
        userId: user.id,
        themeId: theme.themeId,
        input: raw,
      });
      return {
        ok: true as const,
        slug: updated.slug,
        error: null as string | null,
      };
    }

    if (intent === "retry-upload") {
      const version = Number(form.get("version"));
      const result = await retryFailedVersion(deps, {
        userId: user.id,
        themeId: theme.themeId,
        version,
      });
      return {
        ok: true as const,
        version: result.version,
        generationState: result.generationState,
        error: null as string | null,
      };
    }

    return { ok: false as const, error: "unknown_intent" };
  } catch (error) {
    if (error instanceof CreatorThemeError) {
      return { ok: false as const, error: error.code };
    }
    throw error;
  }
}

function platformsLabel(theme: CreatorThemeDetail): string {
  const input = theme.versions[0]?.creatorInput;
  return input?.platforms?.join(", ") ?? "—";
}

export default function EditThemePage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const theme = loaderData.theme;
  const latest = theme.versions[0];
  const error = actionData && "error" in actionData ? actionData.error : null;
  const visibility =
    actionData && "visibility" in actionData && actionData.visibility
      ? actionData.visibility
      : theme.visibility;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Edit theme</h1>
      <p className="mt-1 text-sm text-slate-600">
        {theme.slug} · {visibility}
        {theme.currentVersion != null
          ? ` · current v${theme.currentVersion}`
          : ""}
      </p>

      {error ? (
        <p className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="mt-4 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Saved
          {"visibility" in actionData && actionData.visibility
            ? ` · ${String(actionData.visibility) === "public" ? "Public" : String(actionData.visibility) === "unlisted" ? "Unlisted" : actionData.visibility}`
            : ""}
          {"version" in actionData && actionData.version
            ? ` · Version ${actionData.version}`
            : ""}
        </p>
      ) : null}

      <section className="mt-6 space-y-2 rounded border border-slate-200 p-4">
        <h2 className="text-lg font-medium">Package status</h2>
        <p>
          Generation:{" "}
          <strong>{latest?.generationState ?? theme.packageStatus}</strong>
        </p>
        {latest?.generationErrorCode ? (
          <p className="text-sm text-red-700">
            Error: {latest.generationErrorCode}
            {latest.generationErrorDetail
              ? ` — ${latest.generationErrorDetail}`
              : ""}
          </p>
        ) : null}
        <p className="text-sm text-slate-600">Platforms: {platformsLabel(theme)}</p>
        {latest?.payloadDigest ? (
          <p className="break-all font-mono text-xs">
            payload: {latest.payloadDigest}
          </p>
        ) : null}
        {latest?.archiveDigest ? (
          <p className="break-all font-mono text-xs">
            archive: {latest.archiveDigest}
          </p>
        ) : null}
        {latest?.archiveBytes != null ? (
          <p className="text-sm">Package size: {latest.archiveBytes} bytes</p>
        ) : null}
        {latest?.generationState === "ready" ? (
          <ul className="list-disc pl-5 text-sm">
            <li>manifest.json</li>
            <li>preview.jpg</li>
            <li>INSTALL.md</li>
            <li>install-prompt.md</li>
            {latest.macosAdapterKey ? <li>adapters/macos/theme.json</li> : null}
            {latest.windowsAdapterKey ? (
              <li>adapters/windows/theme.json</li>
            ) : null}
          </ul>
        ) : null}
        {latest?.generationState === "ready" && latest.previewKey ? (
          <p className="text-sm">
            <a
              href={`/api/creator-artifacts/${theme.themeId}/${latest.version}/preview`}
            >
              Source preview
            </a>
          </p>
        ) : null}
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-medium">Actions</h2>
        {latest?.generationState === "ready" ? (
          <form method="post">
            <input type="hidden" name="intent" value="publish" />
            <input type="hidden" name="version" value={latest.version} />
            <button type="submit">Publish</button>
          </form>
        ) : null}

        {visibility === "public" || visibility === "unlisted" ? (
          <form method="post">
            <input type="hidden" name="intent" value="unlist" />
            <button type="submit">Unlist</button>
          </form>
        ) : null}

        <form method="post">
          <input type="hidden" name="intent" value="create-version" />
          <button type="submit">Create new version</button>
        </form>

        {latest?.generationState === "failed" ? (
          <form method="post">
            <input type="hidden" name="intent" value="retry-upload" />
            <input type="hidden" name="version" value={latest.version} />
            <button type="submit">Retry upload</button>
          </form>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Version history</h2>
        <ul className="mt-2 space-y-2">
          {theme.versions.map((v) => (
            <li
              key={v.version}
              className="rounded border border-slate-200 px-3 py-2 text-sm"
            >
              <strong>Version {v.version}</strong> · {v.generationState}
              {theme.currentVersion === v.version ? " · current" : ""}
              {v.generationErrorCode ? ` · ${v.generationErrorCode}` : ""}
              {v.generationState === "ready" ? (
                <span className="ml-2 space-x-2">
                  <a
                    href={`/api/creator-artifacts/${theme.themeId}/${v.version}/manifest`}
                  >
                    manifest
                  </a>
                  <a
                    href={`/api/creator-artifacts/${theme.themeId}/${v.version}/install`}
                  >
                    INSTALL
                  </a>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
