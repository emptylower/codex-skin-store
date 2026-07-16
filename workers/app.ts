import { createRequestHandler } from "react-router";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

/** Production CSP aligned with public/_headers (plus blob: for previews). */
const PRODUCTION_CSP =
  "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'";

/**
 * Dev CSP must allow Vite HMR (inline refresh runtime + websocket).
 * Production keeps a strict script-src / connect-src policy.
 */
const DEVELOPMENT_CSP =
  "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; font-src 'self' data:; connect-src 'self' ws: wss: http: https:; base-uri 'self'; form-action 'self'";

function documentSecurityHeaders(): ReadonlyArray<readonly [string, string]> {
  const csp = import.meta.env.DEV ? DEVELOPMENT_CSP : PRODUCTION_CSP;
  return [
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
    ["Content-Security-Policy", csp],
  ];
}

function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get("Content-Type") ?? "";
  return contentType.toLowerCase().includes("text/html");
}

function withDocumentSecurityHeaders(response: Response): Response {
  if (!isHtmlResponse(response)) {
    return response;
  }

  const headers = new Headers(response.headers);
  for (const [name, value] of documentSecurityHeaders()) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const response = await requestHandler(request, {
      cloudflare: { env, ctx },
    });
    return withDocumentSecurityHeaders(response);
  },
} satisfies ExportedHandler<Env>;
