import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "~": path.join(rootDir, "app"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["app/**/*.test.{ts,tsx}", "tests/unit/**/*.{ts,tsx}"],
    passWithNoTests: true,
  },
});
