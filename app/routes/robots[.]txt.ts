import { createServices } from "~/services/create-services.server";
import type { Route } from "./+types/robots[.]txt";

export async function loader({ context }: Route.LoaderArgs) {
  const origin = context.cloudflare.env.APP_ORIGIN;
  const { seo } = createServices(context.cloudflare.env);
  const body = seo.buildRobotsTxt(origin);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
