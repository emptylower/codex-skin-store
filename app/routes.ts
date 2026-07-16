import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/locale-redirect.tsx"),
  route(":locale", "routes/marketplace.tsx"),
] satisfies RouteConfig;
