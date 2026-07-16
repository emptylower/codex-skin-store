import type { D1Migration } from "@cloudflare/vitest-pool-workers";

declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: D1Migration[];
    BETTER_AUTH_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    R2_ACCOUNT_ID?: string;
    R2_ACCESS_KEY_ID?: string;
    R2_SECRET_ACCESS_KEY?: string;
    ENABLE_GIF_UPLOADS: string;
    ZIP_WRITER: string;
    SOURCES: R2Bucket;
    PACKAGES: R2Bucket;
    PACKAGE_QUEUE: Queue<PackageQueueMessage>;
    IMAGES: ImagesBinding;
  }
}

/** Queue payload for package generation jobs. */
interface PackageQueueMessage {
  jobId: string;
  idempotencyKey: string;
}

export {};
