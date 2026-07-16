import { Breadcrumbs } from "~/components/breadcrumbs";
import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages, type Messages } from "~/i18n/messages";
import type { Route } from "./+types/policy-page";

const POLICY_PAGES = ["terms", "privacy", "copyright", "about"] as const;
type PolicySlug = (typeof POLICY_PAGES)[number];

function isPolicySlug(value: string): value is PolicySlug {
  return (POLICY_PAGES as readonly string[]).includes(value);
}

function policyBodyKey(slug: PolicySlug): keyof Messages["policy"] {
  return `${slug}Body` as keyof Messages["policy"];
}

/** Resolve policy slug from flat path (/:locale/terms) or legacy params.page. */
function resolvePolicySlug(
  request: Request,
  params: { page?: string; locale?: string },
): string {
  if (params.page) {
    return params.page;
  }

  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  return segments.at(-1) ?? "";
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) {
    return [{ title: "Codex Skin Store" }];
  }
  return [
    { title: `${data.title} · Codex Skin Store` },
    { name: "description", content: data.body.slice(0, 160) },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const page = resolvePolicySlug(request, params);
  if (!isPolicySlug(page)) {
    throw new Response("Not Found", { status: 404 });
  }

  const messages = getMessages(locale);
  const title = messages.policy[page];
  const body = messages.policy[policyBodyKey(page)];

  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    messages,
    page,
    title,
    body,
  };
}

export default function PolicyPage({ loaderData }: Route.ComponentProps) {
  const { locale, messages, title, body } = loaderData;

  return (
    <main className="policy-page">
      <Breadcrumbs
        items={[
          { label: messages.breadcrumbs.home, href: localePath(locale) },
          { label: title },
        ]}
      />
      <header className="policy-page__header">
        <h1>{title}</h1>
      </header>
      <div className="policy-page__body">
        {body.split(/\n\n+/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </main>
  );
}
