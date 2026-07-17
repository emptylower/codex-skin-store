import { createRequestHandler } from "react-router";

import type { PackageQueueMessage } from "~/platform/ports";
import { reconcileCounters } from "~/services/engagement/counters.server";
import {
  consumePackageMessage,
  createJobDeps,
  sweepExpiredJobs,
} from "~/services/package-jobs.server";

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

/**
 * Production CSP.
 * React Router SSR emits inline scripts for hydration/context handoff, so
 * script-src must allow 'unsafe-inline'. Cloudflare Web Analytics beacon is
 * optional and allowed when the zone injects it.
 */
const PRODUCTION_CSP =
  "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";

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

  async queue(batch: MessageBatch<PackageQueueMessage>, env: Env) {
    // Consumer max_batch_size is 1; still iterate defensively.
    for (const message of batch.messages) {
      const deps = createJobDeps(env);
      const outcome = await consumePackageMessage(deps, message.body);
      if (outcome.kind === "retry") {
        message.retry({ delaySeconds: outcome.delaySeconds });
      } else {
        message.ack();
      }
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    const scheduledTime = controller.scheduledTime ?? Date.now();
    ctx.waitUntil(
      (async () => {
        await sweepExpiredJobs(createJobDeps(env), new Date(scheduledTime));
        await reconcileCounters(env, scheduledTime);
      })(),
    );
  },
} satisfies ExportedHandler<Env, PackageQueueMessage>;
