import { createPackageQueue } from "~/platform/cloudflare/package-queue.server";
import { createR2Presigner } from "~/platform/cloudflare/r2-presign.server";
import { createSourceObjectStore } from "~/platform/cloudflare/r2-sources.server";
import type { ObjectPresigner } from "~/platform/ports";
import type { UploadDeps } from "~/services/uploads.server";

/**
 * Wire Cloudflare SOURCES / PACKAGE_QUEUE / R2 presign secrets into upload ports.
 * Routes must call this instead of importing platform/cloudflare adapters.
 */
export function createUploadDeps(env: Env): UploadDeps {
  const presign: ObjectPresigner =
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
      ? createR2Presigner({
          R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
          R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
          R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
        })
      : {
          async signPut() {
            throw new Error("presign_not_configured");
          },
        };

  return {
    db: env.DB,
    sources: createSourceObjectStore(env.SOURCES),
    queue: createPackageQueue(env.PACKAGE_QUEUE),
    presign,
  };
}
