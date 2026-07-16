import { redirect } from "react-router";

import { negotiateLocale } from "~/i18n/config";
import type { Route } from "./+types/locale-redirect";

export function loader({ request }: Route.LoaderArgs) {
  const locale = negotiateLocale(request.headers.get("Accept-Language"));
  return redirect(`/${locale}`, 302);
}
