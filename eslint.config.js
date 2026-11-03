// @ts-check
import js from "@eslint/js";
import nabu from "@nabu/lint/eslint";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/** UI code: everything users see goes through MF2 and <T>. */
const UI_CODE = ["packages/ui/src/**/*.{ts,tsx}", "apps/web/src/**/*.{ts,tsx}"];
/** Fixtures that must trip every rule (packages/lint/test/eslint-fixtures.test.ts). Ignored by `pnpm lint`. */
const LINT_FIXTURES = ["packages/lint/fixtures/eslint/**/*.{ts,tsx}"];
const UI_FIXTURES = ["packages/lint/fixtures/eslint/**/*.tsx"];

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/storybook-static/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/src/generated/**",
      "**/*.module.d.css.ts",
      "**/.venv/**",
      "pipeline/**",
      ...LINT_FIXTURES,
      "packages/lint/fixtures/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    plugins: { nabu },
    rules: {
      "nabu/locale-case": "error",
      "nabu/no-code-unit-text-ops": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
  {
    files: [...UI_CODE, ...UI_FIXTURES],
    rules: {
      "nabu/no-literal-ui-strings": "error",
      "nabu/no-manual-tagged-text": "error",
    },
  },
  {
    // The one place allowed to take TaggedText apart for rendering.
    files: ["packages/ui/src/T.tsx"],
    rules: { "nabu/no-manual-tagged-text": "off" },
  },
  {
    // packages/core is pure: no clock, no ambient randomness (CLAUDE.md).
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Inject a clock; core is pure." },
        { object: "Math", property: "random", message: "Inject a seeded RNG; core is pure." },
        { object: "performance", property: "now", message: "Inject a clock; core is pure." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "Inject a clock; core is pure." },
      ],
      "no-restricted-globals": ["error", "fetch", "localStorage", "sessionStorage", "indexedDB", "XMLHttpRequest"],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { "nabu/no-code-unit-text-ops": "off", "nabu/no-manual-tagged-text": "off" },
  },
);
