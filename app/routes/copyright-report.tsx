import { redirect } from "react-router";

import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { createSourceObjectStore } from "~/platform/cloudflare/r2-sources.server";
import { checkAbuseGate } from "~/services/moderation/abuse-gate.server";
import {
  createCopyrightClaim,
  TakedownError,
} from "~/services/moderation/takedown.server";
import type { Route } from "./+types/copyright-report";

export function meta() {
  return [
    { title: "Copyright report · Codex Skin Store" },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });
  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };
  return {
    ...localeData,
    submitted: false as boolean,
    error: null as string | null,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) throw new Response("Not Found", { status: 404 });

  const form = await request.formData();
  const env = context.cloudflare.env;

  const gate = await checkAbuseGate(env, request, {
    action: "report",
    userId: "anonymous",
  });
  if (!gate.allowed) {
    throw new Response("Too Many Requests", { status: 429 });
  }

  const claimantEmail = String(form.get("claimantEmail") ?? "");
  const claimantName = String(form.get("claimantName") ?? "");
  const targetThemeId = String(form.get("targetThemeId") ?? "");
  const rightsBasis = String(form.get("rightsBasis") ?? "");
  const statement = String(form.get("statement") ?? "");
  const signature = String(form.get("signature") ?? "");

  const evidenceFile = form.get("evidence");
  const evidenceItems: Array<{
    mediaType: string;
    byteSize: number;
    sha256: string;
    bytes?: Uint8Array;
  }> = [];

  if (evidenceFile instanceof File && evidenceFile.size > 0) {
    const bytes = new Uint8Array(await evidenceFile.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    evidenceItems.push({
      mediaType: evidenceFile.type || "application/octet-stream",
      byteSize: evidenceFile.size,
      sha256,
      bytes,
    });
  }

  try {
    const sources = createSourceObjectStore(env.SOURCES);
    const claim = await createCopyrightClaim(env.DB, {
      claimantEmail,
      claimantName,
      targetThemeId,
      rightsBasis,
      statement,
      signature,
      evidence: evidenceItems.map(({ mediaType, byteSize, sha256 }) => ({
        mediaType,
        byteSize,
        sha256,
      })),
      storeEvidence: async ({ objectKey, mediaType, sha256, byteSize }) => {
        const match = evidenceItems.find((e) => e.sha256 === sha256);
        if (!match?.bytes) return;
        await sources.put?.(objectKey, match.bytes, {
          httpMetadata: { contentType: mediaType },
          customMetadata: {
            sha256,
            byteSize: String(byteSize),
            purpose: "copyright_evidence",
          },
        });
      },
    });

    throw redirect(
      `${localePath(locale, "/copyright/report")}?submitted=1&ref=${encodeURIComponent(claim.id.slice(0, 8))}`,
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof TakedownError) {
      throw redirect(
        `${localePath(locale, "/copyright/report")}?error=${encodeURIComponent(error.code)}`,
      );
    }
    throw error;
  }
}

export default function CopyrightReport({ loaderData }: Route.ComponentProps) {
  const { locale } = loaderData;

  return (
    <main className="copyright-report" data-testid="copyright-report">
      <h1>Copyright report</h1>
      <p>
        Submit a good-faith copyright claim. Evidence is stored privately and is
        not publicly accessible. Legal review may be required before final
        action.
      </p>
      <p>
        See also the{" "}
        <a href={localePath(locale, "/copyright")}>copyright policy</a>.
      </p>

      <form
        method="post"
        encType="multipart/form-data"
        className="copyright-report-form"
      >
        <label>
          Your name
          <input name="claimantName" required minLength={2} maxLength={200} />
        </label>
        <label>
          Contact email
          <input
            name="claimantEmail"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
          />
        </label>
        <label>
          Theme ID
          <input name="targetThemeId" required maxLength={128} />
        </label>
        <label>
          Rights basis
          <input name="rightsBasis" required minLength={3} maxLength={500} />
        </label>
        <label>
          Statement (include good-faith / perjury language)
          <textarea name="statement" required minLength={20} rows={6} />
        </label>
        <label>
          Typed signature
          <input name="signature" required minLength={2} maxLength={200} />
        </label>
        <label>
          Evidence (optional PNG/JPEG/WebP/PDF, max 5MB)
          <input
            name="evidence"
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
          />
        </label>
        <button type="submit">Submit claim</button>
      </form>
    </main>
  );
}
