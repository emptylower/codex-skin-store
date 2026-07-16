import { redirect } from "react-router";

import { parseLocale } from "~/i18n/config";
import {
  clientIpFromRequest,
  createD1AbuseGate,
  hashIp,
} from "~/platform/cloudflare/rate-limit.server";
import { getOptionalUser } from "~/services/identity.server";
import {
  createIntent,
  signInPathWithIntent,
} from "~/services/identity/intents.server";
import {
  createReport,
  ReportError,
  REPORT_REASONS,
} from "~/services/moderation/reports.server";
import type { Route } from "./+types/report";

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  const form = await request.formData();
  const targetType = String(form.get("targetType") ?? "theme");
  const targetId = String(form.get("targetId") ?? "");
  const reason = String(form.get("reason") ?? "");
  const details = String(form.get("details") ?? "");
  const themeId = String(form.get("themeId") ?? targetId);
  const returnPath = String(
    form.get("returnPath") ?? `/${locale}`,
  );

  if (!targetId || !REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) {
    throw new Response("Bad Request", { status: 400 });
  }

  const env = context.cloudflare.env;
  const user = await getOptionalUser(request, env);

  if (!user) {
    const intent = await createIntent(env.DB, {
      action: "report",
      themeId,
      payload: {
        returnPath,
        reason,
        details: details.slice(0, 2000),
        targetType: targetType as "theme" | "comment" | "user",
        targetId,
      },
    });
    throw redirect(signInPathWithIntent(locale, intent.token, returnPath));
  }

  const ip = clientIpFromRequest(request);
  const ipHash = await hashIp(ip, env.BETTER_AUTH_SECRET);
  const gate = createD1AbuseGate(env.DB);
  const gateResult = await gate.check({
    action: "report",
    userId: user.id,
    ipHash,
  });
  if (!gateResult.allowed) {
    throw new Response("Too Many Requests", { status: 429 });
  }

  try {
    await createReport(env.DB, {
      reporterId: user.id,
      targetType: targetType as "theme" | "comment" | "user",
      targetId,
      reason: reason as (typeof REPORT_REASONS)[number],
      details,
    });
  } catch (error) {
    if (error instanceof ReportError) {
      if (error.code === "duplicate") {
        // Idempotent UX: treat as success confirmation.
        throw redirect(`${returnPath}${returnPath.includes("?") ? "&" : "?"}reported=1`);
      }
      if (error.code === "not_found") {
        throw new Response("Not Found", { status: 404 });
      }
      throw new Response(error.code, { status: 400 });
    }
    throw error;
  }

  const sep = returnPath.includes("?") ? "&" : "?";
  throw redirect(`${returnPath}${sep}reported=1`);
}

export async function loader() {
  return new Response("Method Not Allowed", { status: 405 });
}
