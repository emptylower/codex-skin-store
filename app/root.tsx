import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useMatches,
} from "react-router";

import {
  defaultLocale,
  htmlLang,
  parseLocale,
  type LocaleLoaderData,
} from "~/i18n/config";
import type { Route } from "./+types/root";
import "./styles/app.css";

// System font stack only — keeps CSP tight (no external font CDN).
export const links: Route.LinksFunction = () => [];

/** Prefer validated loader data (deepest match) over pathname parsing. */
function useDocumentLang(): string {
  const matches = useMatches();
  for (const match of matches.slice().reverse()) {
    const data = match.data as Partial<LocaleLoaderData> | undefined;
    if (data?.htmlLang) return data.htmlLang;
    const locale = data?.locale ? parseLocale(data.locale) : null;
    if (locale) return htmlLang(locale);
  }
  return htmlLang(defaultLocale);
}

export function Layout({ children }: { children: React.ReactNode }) {
  const lang = useDocumentLang();

  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="error-boundary">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
