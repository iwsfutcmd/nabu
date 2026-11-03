import nabu from "@nabu/lint/stylelint";

/** @type {import("stylelint").Config} */
export default {
  ...nabu,
  ignoreFiles: ["**/node_modules/**", "**/storybook-static/**", "**/dist/**", "packages/lint/fixtures/**"],
};
