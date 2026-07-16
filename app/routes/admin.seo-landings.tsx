import { redirect } from "react-router";

import { LandingReviewTable } from "~/components/seo/landing-review";
import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { requireModerator } from "~/services/moderation/require-moderator.server";
import { setLandingIndexStatus } from "~/services/seo/landings.server";
import { requireSameOrigin } from "~/utils/same-origin.server";
import type { Route } from "./+types/admin.seo-landings";

export function meta() {
  return [
    { title: "Admin · SEO Landings · Codex Skin Store" },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  let actor: Awaited<ReturnType<typeof requireModerator>>;
  try {
    actor = await requireModerator(request, context.cloudflare.env, "seo.review");
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      throw redirect(localePath(locale, "/auth/sign-in"));
    }
    throw error;
  }

  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT l.id, l.slug, l.index_status AS indexStatus,
            l.rollout_batch AS rolloutBatch, l.eligibility_json AS eligibilityJson,
            en.translation_status AS enStatus,
            zh.translation_status AS zhStatus
     FROM seo_landings l
     LEFT JOIN seo_landing_translations en
       ON en.landing_id = l.id AND en.locale = 'en'
     LEFT JOIN seo_landing_translations zh
       ON zh.landing_id = l.id AND zh.locale = 'zh-hans'
     ORDER BY l.updated_at DESC
     LIMIT 200`,
  ).all();

  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    actor: { id: actor.id, role: actor.role },
    landings: rows.results ?? [],
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });
  requireSameOrigin(request);

  const actor = await requireModerator(
    request,
    context.cloudflare.env,
    "seo.review",
  );
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const landingId = String(form.get("landingId") ?? "");
  const reason = String(form.get("reason") ?? "");
  const batchRaw = String(form.get("rolloutBatch") ?? "");
  const override = String(form.get("override") ?? "") === "1";
  if (!landingId || reason.trim().length < 3) {
    throw new Response("Bad Request", { status: 400 });
  }

  const statusMap = {
    approve: "approved",
    pause: "paused",
    retire: "retired",
    candidate: "candidate",
  } as const;
  const indexStatus = statusMap[intent as keyof typeof statusMap];
  if (!indexStatus) throw new Response("Bad Request", { status: 400 });

  await setLandingIndexStatus(context.cloudflare.env.DB, {
    actorId: actor.id,
    landingId,
    indexStatus,
    rolloutBatch: batchRaw ? Number(batchRaw) : null,
    reason,
    override: override || intent !== "approve",
  });

  throw redirect(localePath(locale, "/admin/seo-landings"));
}

export default function AdminSeoLandings({ loaderData }: Route.ComponentProps) {
  const { locale, landings, actor } = loaderData;
  return (
    <main className="admin-console" data-testid="admin-seo-landings">
      <h1>SEO landing registry</h1>
      <p>
        Actor: {actor.role}. Filters never create landings — only this registry
        routes canonically.
      </p>
      <LandingReviewTable landings={landings as never} locale={locale} />
    </main>
  );
}
