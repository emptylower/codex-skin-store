import { createServices } from "~/services/create-services.server";
import type { Route } from "./+types/sitemap[.]xml";

export async function loader({ context }: Route.LoaderArgs) {
  const origin = context.cloudflare.env.APP_ORIGIN;
  const { seo } = createServices(context.cloudflare.env);
  const body = await seo.buildSitemapXml(origin);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
