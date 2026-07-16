import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Codex Skin Store" },
    { name: "description", content: "Codex Skin Store marketplace" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return {
    locale: context.cloudflare.env.DEFAULT_LOCALE,
    origin: context.cloudflare.env.APP_ORIGIN,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="home">
      <h1>Codex Skin Store</h1>
      <p>Marketplace scaffold is ready.</p>
      <p>
        Locale: {loaderData.locale} · Origin: {loaderData.origin}
      </p>
    </main>
  );
}
