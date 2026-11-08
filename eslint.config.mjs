import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/next-env.d.ts",
      "apps/mobile/android/**",
      "apps/mobile/modules/**/android/**",
      "apps/web/public/sw.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx}", "apps/mobile/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
  // Plain-JS extension (no build step; see DECISIONS D11).
  {
    files: ["apps/extension/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker, chrome: "readonly" } },
  },
  // Node scripts and tests.
  {
    files: ["apps/extension/tests/**/*.js", "**/scripts/**/*.{js,mjs}", "eslint.config.mjs", "apps/web/playwright.config.ts", "apps/web/e2e/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] } },
);
