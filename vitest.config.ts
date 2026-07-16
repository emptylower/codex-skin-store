import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["app/**/*.test.{ts,tsx}", "tests/unit/**/*.{ts,tsx}"],
    passWithNoTests: true,
  },
});
