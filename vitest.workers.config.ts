import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/workers/**/*.{ts,tsx}", "workers/**/*.test.ts"],
    passWithNoTests: true,
  },
});
