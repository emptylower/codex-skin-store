import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/locale-redirect.tsx"),
  route(":locale", "routes/marketplace.tsx"),
  route(":locale/themes/:slug", "routes/theme-detail.tsx"),
  route(":locale/creators/:handle", "routes/creator-profile.tsx"),
  route(":locale/taxonomies/:dimension/:key", "routes/taxonomy-hub.tsx"),
  route(":locale/policies/:page", "routes/policy-page.tsx"),
] satisfies RouteConfig;
