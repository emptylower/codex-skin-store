import { useState } from "react";
import { redirect } from "react-router";

import { parseLocale, localePath } from "~/i18n/config";
import {
  authorizePromptAccess,
  DeliveryError,
  markPromptCopyEvent,
} from "~/services/engagement/delivery.server";
import { getOptionalUser, requireUser } from "~/services/identity.server";
import {
  createIntent,
  signInPathWithIntent,
} from "~/services/identity/intents.server";
import type { Route } from "./+types/theme-prompt";

async function readPromptText(
  packages: R2Bucket,
  keys: { promptKey: string | null; installKey: string | null },
): Promise<string | null> {
  for (const key of [keys.promptKey, keys.installKey]) {
    if (!key) continue;
    const obj = await packages.get(key);
    if (!obj) continue;
    const text = await obj.text();
    if (text.trim()) return text;
  }
  return null;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });
  const slug = params.slug ?? "";
  if (!slug) throw new Response("Not Found", { status: 404 });

  const env = context.cloudflare.env;
  const user = await getOptionalUser(request, env);

  let authorized;
  try {
    authorized = await authorizePromptAccess(env.DB, { slug });
  } catch (error) {
    if (error instanceof DeliveryError) {
      throw new Response("Not Found", { status: 404 });
    }
    throw error;
  }

  if (!user) {
    const returnPath = `/${locale}/themes/${encodeURIComponent(slug)}`;
    const intent = await createIntent(env.DB, {
      action: "copy_prompt",
      themeId: authorized.themeId,
      payload: { returnPath },
    });
    throw redirect(signInPathWithIntent(locale, intent.token, returnPath));
  }

  const promptText = await readPromptText(env.PACKAGES, {
    promptKey: authorized.promptKey,
    installKey: authorized.installKey,
  });

  if (!promptText) {
    throw new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const confirm = url.searchParams.get("confirm") === "1";

  return {
    locale,
    slug,
    themeId: authorized.themeId,
    themeVersion: authorized.version,
    promptText: confirm ? promptText : null,
    needsConfirm: !confirm,
    themePath: localePath(locale, `/themes/${slug}`),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });
  const slug = params.slug ?? "";
  if (!slug) throw new Response("Not Found", { status: 404 });

  const user = await requireUser(request, context.cloudflare.env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "copied") {
    let authorized;
    try {
      authorized = await authorizePromptAccess(context.cloudflare.env.DB, {
        slug,
      });
    } catch {
      throw new Response("Not Found", { status: 404 });
    }

    await markPromptCopyEvent(context.cloudflare.env.DB, {
      userId: user.id,
      themeId: authorized.themeId,
      themeVersion: authorized.version,
    });
    return { ok: true as const };
  }

  if (intent === "show") {
    throw redirect(
      `/${locale}/themes/${encodeURIComponent(slug)}/prompt?confirm=1`,
    );
  }

  throw new Response("Bad Request", { status: 400 });
}

export default function ThemePromptPage({
  loaderData,
}: Route.ComponentProps) {
  const { promptText, needsConfirm, themePath, slug, locale } = loaderData;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "fallback">(
    "idle",
  );

  async function onCopy() {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setCopyState("copied");
      // Record only after clipboard success (progressive enhancement).
      await fetch(`/${locale}/themes/${slug}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ intent: "copied" }),
        credentials: "include",
      });
    } catch {
      setCopyState("fallback");
    }
  }

  return (
    <main className="theme-prompt">
      <h1>Install prompt</h1>
      <p>
        <a href={themePath}>Back to theme</a>
      </p>

      {needsConfirm ? (
        <form method="post">
          <input type="hidden" name="intent" value="show" />
          <p>
            Confirm to reveal the install prompt. Clipboard is never written
            automatically after sign-in.
          </p>
          <button type="submit" data-testid="confirm-show-prompt">
            Show prompt
          </button>
        </form>
      ) : (
        <section>
          <button
            type="button"
            data-testid="copy-prompt-button"
            onClick={() => void onCopy()}
          >
            Copy Prompt
          </button>
          {copyState === "copied" ? (
            <p role="status">Copied to clipboard.</p>
          ) : null}
          {copyState === "fallback" ? (
            <p role="status">
              Clipboard unavailable. Select the text below to copy manually.
            </p>
          ) : null}
          <pre
            className="theme-prompt__text"
            data-testid="prompt-text"
            tabIndex={0}
          >
            {promptText}
          </pre>
        </section>
      )}
    </main>
  );
}
