import {
  htmlLang,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import type { Route } from "./+types/home";

export function meta({ data }: Route.MetaArgs) {
  const title = data
    ? `Codex Skin Store · ${data.messages.nav.explore}`
    : "Codex Skin Store";
  return [
    { title },
    { name: "description", content: "Codex Skin Store marketplace" },
  ];
}

export function loader({ params, context }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    origin: context.cloudflare.env.APP_ORIGIN,
    messages: getMessages(locale),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { locale, origin, messages } = loaderData;

  return (
    <main className="home">
      <nav aria-label="Primary">
        <span>{messages.nav.explore}</span>
        <span>{messages.nav.upload}</span>
      </nav>
      <h1>Codex Skin Store</h1>
      <p>Marketplace scaffold is ready.</p>
      <p>
        Locale: {locale} · Origin: {origin}
      </p>
    </main>
  );
}
