import { createSourceObjectStore } from "~/platform/cloudflare/r2-sources.server";
import type { SourceObjectStore } from "~/platform/ports";

/**
 * Wire private SOURCES bucket for copyright evidence.
 * Routes must call this instead of importing platform/cloudflare adapters.
 */
export function createEvidenceObjectStore(env: Env): SourceObjectStore {
  return createSourceObjectStore(env.SOURCES);
}
