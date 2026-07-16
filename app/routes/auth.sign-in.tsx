import {
  htmlLang,
  localePath,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import { getMessages } from "~/i18n/messages";
import type { Route } from "./+types/auth.sign-in";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: "Sign in · Codex Skin Store" }];
  return [
    { title: `${data.title} · Codex Skin Store` },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const locale = parseLocale(params.locale ?? "");
  if (!locale) {
    throw new Response("Not Found", { status: 404 });
  }

  const messages = getMessages(locale);
  const localeData: LocaleLoaderData = {
    locale,
    htmlLang: htmlLang(locale),
  };

  return {
    ...localeData,
    title: messages.auth.signIn,
    googleUrl: "/api/auth/sign-in/social?provider=google",
    githubUrl: "/api/auth/sign-in/social?provider=github",
  };
}

export default function SignIn({ loaderData }: Route.ComponentProps) {
  const { title, googleUrl, githubUrl, locale } = loaderData;

  return (
    <main className="auth-sign-in">
      <h1>{title}</h1>
      <p>Continue with a trusted OAuth provider to create or open your profile.</p>
      <ul className="auth-providers">
        <li>
          <a href={googleUrl} data-provider="google">
            Continue with Google
          </a>
        </li>
        <li>
          <a href={githubUrl} data-provider="github">
            Continue with GitHub
          </a>
        </li>
      </ul>
      <p>
        <a href={localePath(locale)}>Back to marketplace</a>
      </p>
    </main>
  );
}
