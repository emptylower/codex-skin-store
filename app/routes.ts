import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/locale-redirect.tsx"),
  route("robots.txt", "routes/robots[.]txt.ts"),
  route("sitemap.xml", "routes/sitemap[.]xml.ts"),
  route(":locale", "routes/marketplace.tsx"),
  route(":locale/themes/:slug", "routes/theme-detail.tsx"),
  route(":locale/creators/:handle", "routes/creator-profile.tsx"),
  route(":locale/taxonomies/:dimension/:key", "routes/taxonomy-hub.tsx"),
  route(":locale/terms", "routes/policy-page.tsx", { id: "routes/terms" }),
  route(":locale/privacy", "routes/policy-page.tsx", { id: "routes/privacy" }),
  route(":locale/copyright", "routes/policy-page.tsx", {
    id: "routes/copyright",
  }),
  route(":locale/about", "routes/policy-page.tsx", { id: "routes/about" }),
] satisfies RouteConfig;
