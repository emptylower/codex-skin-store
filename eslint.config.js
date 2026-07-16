import babelParser from "@babel/eslint-parser";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "node_modules/**",
      "build/**",
      "dist/**",
      ".react-router/**",
      ".wrangler/**",
      "worker-configuration.d.ts",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript"],
          plugins: ["@babel/plugin-syntax-jsx"],
        },
      },
    },
  },
  {
    files: ["app/routes/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "cloudflare:*",
            "~/db/**",
            "~/platform/cloudflare/**",
          ],
        },
      ],
    },
  },
];
