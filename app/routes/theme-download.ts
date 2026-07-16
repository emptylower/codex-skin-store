import { redirect } from "react-router";

import { parseLocale } from "~/i18n/config";
import {
  createR2PackageStore,
  streamPackageDownload,
} from "~/platform/cloudflare/package-download.server";
import {
  authorizePackageDownload,
  DeliveryError,
  markDownloadEvent,
} from "~/services/engagement/delivery.server";
import { getOptionalUser } from "~/services/identity.server";
import {
  createIntent,
  signInPathWithIntent,
} from "~/services/identity/intents.server";
import type { Route } from "./+types/theme-download";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const slug = params.slug ?? "";
  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  const env = context.cloudflare.env;
  const user = await getOptionalUser(request, env);

  let authorized;
  try {
    authorized = await authorizePackageDownload(env.DB, { slug });
  } catch (error) {
    if (error instanceof DeliveryError) {
      throw new Response("Not Found", { status: 404 });
    }
    throw error;
  }

  if (!user) {
    const returnPath = `/${locale}/themes/${encodeURIComponent(slug)}`;
    const intent = await createIntent(env.DB, {
      action: "download",
      themeId: authorized.themeId,
      payload: { returnPath },
    });
    throw redirect(signInPathWithIntent(locale, intent.token, returnPath));
  }

  const response = await streamPackageDownload({
    store: createR2PackageStore(env.PACKAGES),
    packageKey: authorized.packageKey,
    slug: authorized.slug,
    request,
  });

  if (response.status === 200 || response.status === 206) {
    // Record after R2 open succeeded; never block bytes if event fails.
    context.cloudflare.ctx.waitUntil(
      markDownloadEvent(env.DB, {
        userId: user.id,
        themeId: authorized.themeId,
        themeVersion: authorized.version,
      }).catch(() => undefined),
    );
  }

  return response;
}

export async function action() {
  return new Response("Method Not Allowed", { status: 405 });
}
