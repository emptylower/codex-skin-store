import { useState } from "react";
import { Form, redirect, useNavigation } from "react-router";

import {
  MACOS_TARGET,
  WINDOWS_TARGET,
  creatorInputSchema,
} from "~/domain/themes/creator-input";
import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import { requireUser } from "~/services/identity.server";
import {
  createDraft,
  CreatorThemeError,
} from "~/services/creator-themes.server";
import type { Route } from "./+types/upload";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: "Upload · Codex Skin Store" }];
  return [
    { title: `${data.title} · Codex Skin Store` },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

const STATIC_ACCEPT = "image/png,image/jpeg,image/webp";
const GIF_ACCEPT = "image/gif";

function gifUploadsEnabled(env: Env): boolean {
  // wrangler types pin the default literal ("false"); runtime vars may change.
  return String(env.ENABLE_GIF_UPLOADS) === "true";
}

/** GIF is only allowed when the feature flag is on and platforms are Windows-only. */
function allowGifForPlatforms(
  enableGifUploads: boolean,
  platforms: readonly string[],
): boolean {
  return (
    enableGifUploads && platforms.length === 1 && platforms[0] === "windows"
  );
}

function acceptForMedia(allowGif: boolean): string {
  return allowGif ? `${STATIC_ACCEPT},${GIF_ACCEPT}` : STATIC_ACCEPT;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  try {
    await requireUser(request, context.cloudflare.env);
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      throw redirect(localePath(locale, "/auth/sign-in"));
    }
    throw error;
  }

  const messages = getMessages(locale);
  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    title: messages.nav.upload,
    enableGifUploads: gifUploadsEnabled(context.cloudflare.env),
    error: null as string | null,
    draft: null as null | {
      themeId: string;
      version: number;
      slug: string;
      platforms: string[];
    },
  };
}

function formToCreatorInput(form: FormData) {
  const platforms = form.getAll("platforms").map(String);
  const compatibilityTargets = form.getAll("compatibilityTargets").map(String);
  const rights =
    form.get("rightsDeclared") === "true" ||
    form.get("rightsDeclared") === "on";

  return {
    sourceLocale: String(form.get("sourceLocale") ?? "en"),
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? ""),
    slug: String(form.get("slug") ?? ""),
    license: String(form.get("license") ?? "CC0-1.0"),
    attribution: String(form.get("attribution") ?? ""),
    sourceUrl: String(form.get("sourceUrl") ?? ""),
    platforms,
    appearance: String(form.get("appearance") ?? "dark"),
    mediaType: String(form.get("mediaType") ?? "static"),
    accent: String(form.get("accent") ?? "#000000"),
    secondary: String(form.get("secondary") ?? "#000000"),
    highlight: String(form.get("highlight") ?? "#FFFFFF"),
    focalPoint: {
      x: Number(form.get("focalX") ?? 0.5),
      y: Number(form.get("focalY") ?? 0.5),
    },
    compatibilityTargets,
    rightsDeclared: rights ? true : false,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const user = await requireUser(request, context.cloudflare.env);
  const form = await request.formData();
  const raw = formToCreatorInput(form);
  const messages = getMessages(locale);
  const enableGifUploads = gifUploadsEnabled(context.cloudflare.env);

  const parsed = creatorInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      locale,
      htmlLang: htmlLang(locale),
      title: messages.nav.upload,
      enableGifUploads,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
      draft: null,
    };
  }

  try {
    const draft = await createDraft(
      { db: context.cloudflare.env.DB, userId: user.id },
      parsed.data,
    );
    return {
      locale,
      htmlLang: htmlLang(locale),
      title: messages.nav.upload,
      enableGifUploads,
      error: null,
      draft: {
        themeId: draft.themeId,
        version: draft.version,
        slug: draft.slug,
        platforms: [...parsed.data.platforms],
      },
    };
  } catch (error) {
    if (error instanceof CreatorThemeError) {
      return {
        locale,
        htmlLang: htmlLang(locale),
        title: messages.nav.upload,
        enableGifUploads,
        error: error.code,
        draft: null,
      };
    }
    throw error;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `request_failed_${response.status}`);
  }
  return data;
}

export default function UploadPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const data = actionData ?? loaderData;
  const { title, error, draft, locale, enableGifUploads } = data;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const gifAllowed = allowGifForPlatforms(
    enableGifUploads,
    draft?.platforms ?? [],
  );
  const mediaAccept = acceptForMedia(gifAllowed);
  const mediaLabel = gifAllowed
    ? "Background image (PNG, JPEG, WebP, or GIF)"
    : "Background image (PNG, JPEG, or WebP)";
  const mediaHint = gifAllowed
    ? "Select a PNG, JPEG, WebP, or GIF image after creating a draft."
    : "Select a PNG, JPEG, or WebP image after creating a draft.";

  function isAcceptedMediaType(type: string): boolean {
    if (
      type === "image/png" ||
      type === "image/jpeg" ||
      type === "image/webp"
    ) {
      return true;
    }
    return gifAllowed && type === "image/gif";
  }

  async function handleDirectUpload() {
    if (!draft || !file) {
      setUploadStatus(mediaHint);
      return;
    }
    if (!isAcceptedMediaType(file.type)) {
      setUploadStatus(
        gifAllowed
          ? "Only PNG, JPEG, WebP, or GIF is allowed for this draft."
          : "Only PNG, JPEG, or WebP is allowed (GIF requires ENABLE_GIF_UPLOADS and Windows-only platforms).",
      );
      return;
    }
    setUploading(true);
    setUploadStatus("Requesting upload URL…");
    try {
      const presign = await postJson<{
        uploadId: string;
        url: string;
        headers: Record<string, string>;
      }>("/api/uploads/presign", {
        themeId: draft.themeId,
        version: draft.version,
        contentType: file.type,
        bytes: file.size,
      });

      setUploadStatus("Uploading media…");
      // Direct PUT to R2 without cookies.
      const upload = await fetch(presign.url, {
        method: "PUT",
        headers: presign.headers,
        body: file,
      });
      if (!upload.ok) {
        throw new Error("direct_upload_failed");
      }

      setUploadStatus("Finalizing…");
      await postJson("/api/uploads/complete", { uploadId: presign.uploadId });
      setUploadStatus("Upload complete. Package generation queued.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "upload_failed";
      setUploadStatus(message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="upload-page">
      <h1>{title}</h1>
      <p>
        Upload one image and structured theme fields only. ZIP, JSON, Markdown,
        and install prompts are generated by the platform.
      </p>

      {error ? <p role="alert">{error}</p> : null}

      {draft ? (
        <section aria-labelledby="media-upload-heading">
          <h2 id="media-upload-heading">Media for draft “{draft.slug}”</h2>
          <p>
            Theme ID: <code>{draft.themeId}</code> · version {draft.version}
          </p>
          <label>
            {mediaLabel}
            <input
              type="file"
              accept={mediaAccept}
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                if (next && !isAcceptedMediaType(next.type)) {
                  setFile(null);
                  setUploadStatus(
                    gifAllowed
                      ? "Only PNG, JPEG, WebP, or GIF is allowed for this draft."
                      : "Only PNG, JPEG, or WebP is allowed (GIF requires ENABLE_GIF_UPLOADS and Windows-only platforms).",
                  );
                  event.target.value = "";
                  return;
                }
                setUploadStatus(null);
                setFile(next);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => void handleDirectUpload()}
            disabled={uploading || !file}
          >
            {uploading ? "Uploading…" : "Upload media"}
          </button>
          {uploadStatus ? <p role="status">{uploadStatus}</p> : null}
        </section>
      ) : (
        <Form method="post">
          <fieldset>
            <legend>Theme details</legend>
            <label>
              Source locale
              <select name="sourceLocale" defaultValue={locale} required>
                <option value="en">English</option>
                <option value="zh-hans">简体中文</option>
              </select>
            </label>
            <label>
              Name
              <input
                name="name"
                type="text"
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                minLength={20}
                maxLength={500}
                rows={4}
                required
              />
            </label>
            <label>
              Slug
              <input
                name="slug"
                type="text"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                maxLength={64}
                required
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>License</legend>
            <label>
              License
              <select name="license" defaultValue="CC0-1.0" required>
                <option value="CC0-1.0">CC0-1.0</option>
                <option value="CC-BY-4.0">CC-BY-4.0</option>
                <option value="PERSONAL-REDISTRIBUTION-1.0">
                  PERSONAL-REDISTRIBUTION-1.0
                </option>
              </select>
            </label>
            <label>
              Attribution (required for CC-BY)
              <input name="attribution" type="text" maxLength={200} />
            </label>
            <label>
              Source URL (optional)
              <input name="sourceUrl" type="url" placeholder="https://" />
            </label>
            <label>
              <input
                name="rightsDeclared"
                type="checkbox"
                value="true"
                required
              />
              I declare I have the rights to publish this media
            </label>
          </fieldset>

          <fieldset>
            <legend>Platforms and appearance</legend>
            <label>
              <input
                name="platforms"
                type="checkbox"
                value="macos"
                defaultChecked
              />
              macOS
            </label>
            <label>
              <input
                name="platforms"
                type="checkbox"
                value="windows"
                defaultChecked
              />
              Windows
            </label>
            <label>
              <input
                name="compatibilityTargets"
                type="checkbox"
                value={MACOS_TARGET}
                defaultChecked
              />
              {MACOS_TARGET}
            </label>
            <label>
              <input
                name="compatibilityTargets"
                type="checkbox"
                value={WINDOWS_TARGET}
                defaultChecked
              />
              {WINDOWS_TARGET}
            </label>
            <label>
              Appearance
              <select name="appearance" defaultValue="dark" required>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              Media type
              <select name="mediaType" defaultValue="static" required>
                <option value="static">Static</option>
                <option value="animated">Animated (Windows only)</option>
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>Palette and focal point</legend>
            <label>
              Accent
              <input
                name="accent"
                type="text"
                defaultValue="#FF00AA"
                required
              />
            </label>
            <label>
              Secondary
              <input
                name="secondary"
                type="text"
                defaultValue="#110022"
                required
              />
            </label>
            <label>
              Highlight
              <input
                name="highlight"
                type="text"
                defaultValue="#00FFCC"
                required
              />
            </label>
            <label>
              Focal X (0–1)
              <input
                name="focalX"
                type="number"
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.5}
                required
              />
            </label>
            <label>
              Focal Y (0–1)
              <input
                name="focalY"
                type="number"
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.5}
                required
              />
            </label>
          </fieldset>

          <button type="submit" disabled={busy}>
            {busy ? "Creating draft…" : "Create draft"}
          </button>
        </Form>
      )}

      <p>
        <a href={localePath(locale)}>Back to marketplace</a>
      </p>
    </main>
  );
}
