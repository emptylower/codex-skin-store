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
