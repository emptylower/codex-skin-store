import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(rootDir, "migrations"));

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.json" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Auth secrets for local/worker tests (not real credentials).
            BETTER_AUTH_SECRET: "test-better-auth-secret-at-least-32-chars",
            GOOGLE_CLIENT_ID: "test-google-client-id",
            GOOGLE_CLIENT_SECRET: "test-google-client-secret",
            GITHUB_CLIENT_ID: "test-github-client-id",
            GITHUB_CLIENT_SECRET: "test-github-client-secret",
            R2_ACCOUNT_ID: "test-r2-account-id",
            R2_ACCESS_KEY_ID: "test-r2-access-key-id",
            R2_SECRET_ACCESS_KEY: "test-r2-secret-access-key",
          },
        },
      }),
    ],
    resolve: {
      alias: {
        "~": path.join(rootDir, "app"),
      },
    },
    test: {
      include: [
        "tests/integration/**/*.{ts,tsx}",
        "tests/routes/**/*.{ts,tsx}",
        "tests/seo/**/*.{ts,tsx}",
      ],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
