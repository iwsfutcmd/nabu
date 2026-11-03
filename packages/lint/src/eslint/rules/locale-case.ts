/**
 * No toLowerCase()/toUpperCase() without a locale (gameplan §6.4, §11.9):
 * Turkish and Azerbaijani dotted/dotless i, Lithuanian dot-above and Greek
 * final sigma all depend on it. toLowerCase() takes no locale at all, so it is
 * always flagged; toLocale*Case() must be given one. For ASCII identifiers
 * (BCP 47 subtags) use asciiLowercase() from @nabu/core/text.
 *
 * With type information, only string receivers are checked.
 */
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import type ts from "typescript";
import { createRule } from "../create-rule.ts";
import { isStringLike } from "../language-data.ts";

const NO_LOCALE = new Map([
  ["toLowerCase", "toLocaleLowerCase"],
  ["toUpperCase", "toLocaleUpperCase"],
]);
const NEEDS_LOCALE = new Set(["toLocaleLowerCase", "toLocaleUpperCase"]);

export default createRule<[], "noLocale" | "missingLocale">({
  name: "locale-case",
  meta: {
    type: "problem",
    docs: { description: "Require an explicit locale for case mapping." },
    schema: [],
    messages: {
      noLocale:
        "`{{method}}()` ignores the language (Turkish İ/ı, Lithuanian, Greek σ/ς). Use `{{replacement}}(locale)` or the orthography profile's case folding; for ASCII identifiers use asciiLowercase() from @nabu/core/text.",
      missingLocale: "`{{method}}()` without a locale uses the host's locale. Pass the text's language tag.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = context.sourceCode.parserServices;
    const program = services?.program ?? null;
    const isString = (node: ts.Node | undefined): boolean => {
      if (program === null || node === undefined) return true;
      return isStringLike(program.getTypeChecker().getTypeAtLocation(node));
    };
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed || callee.property.type !== AST_NODE_TYPES.Identifier) {
          return;
        }
        const method = callee.property.name;
        const receiver = services?.esTreeNodeToTSNodeMap?.get(callee.object);
        const replacement = NO_LOCALE.get(method);
        if (replacement !== undefined) {
          if (isString(receiver)) context.report({ node, messageId: "noLocale", data: { method, replacement } });
          return;
        }
        if (!NEEDS_LOCALE.has(method)) return;
        const [first] = node.arguments;
        const missing = first === undefined || (first.type === AST_NODE_TYPES.Identifier && first.name === "undefined");
        if (missing && isString(receiver)) context.report({ node, messageId: "missingLocale", data: { method } });
      },
    };
  },
});
