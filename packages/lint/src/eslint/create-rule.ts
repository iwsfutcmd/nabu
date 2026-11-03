import { ESLintUtils } from "@typescript-eslint/utils";

export interface NabuRuleDocs {
  readonly description: string;
  readonly requiresTypeChecking?: boolean;
}

export const createRule = ESLintUtils.RuleCreator<NabuRuleDocs>(
  (name) => `https://github.com/iwsfutcmd/nabu/blob/main/packages/lint/README.md#nabu${name}`,
);
