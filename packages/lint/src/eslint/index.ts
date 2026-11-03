/**
 * @nabu/lint/eslint: the custom rules from gameplan §11.9. The repo's
 * eslint.config.js decides where each applies; packages/lint/fixtures prove
 * each one fires through that real config.
 */
import localeCase from "./rules/locale-case.ts";
import noCodeUnitTextOps from "./rules/no-code-unit-text-ops.ts";
import noLiteralUiStrings from "./rules/no-literal-ui-strings.ts";
import noManualTaggedText from "./rules/no-manual-tagged-text.ts";

export const rules = {
  "locale-case": localeCase,
  "no-code-unit-text-ops": noCodeUnitTextOps,
  "no-literal-ui-strings": noLiteralUiStrings,
  "no-manual-tagged-text": noManualTaggedText,
};

const plugin = { meta: { name: "@nabu/eslint-plugin", version: "0.0.0" }, rules };

export default plugin;
