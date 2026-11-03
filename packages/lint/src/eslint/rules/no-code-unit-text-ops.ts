/**
 * Never index, slice, reverse or count language data by UTF-16 code unit or
 * code point (gameplan §11.9, CLAUDE.md). Type-aware: it fires on values that
 * come from TaggedText/Token/RubySegment/Morph, so ordinary strings (ids,
 * CSS, URLs) are unaffected.
 *
 * Flags: .length, .charAt/.charCodeAt/.codePointAt/.at, .slice/.substring/.substr,
 * computed indexing (s[0]), .split(""), [...s] and Array.from(s).
 */
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule.ts";
import { isStringLike, languageDataDetector } from "../language-data.ts";

const INDEXING_METHODS = new Set(["charAt", "charCodeAt", "codePointAt", "at", "slice", "substring", "substr"]);

export default createRule<[], "codeUnits">({
  name: "no-code-unit-text-ops",
  meta: {
    type: "problem",
    docs: { description: "Disallow code-unit and code-point operations on language data.", requiresTypeChecking: true },
    schema: [],
    messages: {
      codeUnits:
        "`{{op}}` treats language data as UTF-16 code units or code points, which splits grapheme clusters (é, कि, oʻ, ZWJ emoji). Use graphemes()/graphemeCount() from @nabu/core/text.",
    },
  },
  defaultOptions: [],
  create(context) {
    const { isLanguageData, typeOf } = languageDataDetector(context);
    const isLanguageString = (node: TSESTree.Expression): boolean => isStringLike(typeOf(node)) && isLanguageData(node);
    const report = (node: TSESTree.Node, op: string): void => context.report({ node, messageId: "codeUnits", data: { op } });

    return {
      MemberExpression(node) {
        if (node.computed) {
          if (node.property.type !== AST_NODE_TYPES.Literal || typeof node.property.value === "number") {
            if (isLanguageString(node.object)) report(node, "s[i]");
          }
          return;
        }
        if (node.property.type !== AST_NODE_TYPES.Identifier) return;
        const name = node.property.name;
        if (name === "length" && isLanguageString(node.object)) report(node, ".length");
        if (INDEXING_METHODS.has(name) && node.parent.type === AST_NODE_TYPES.CallExpression && node.parent.callee === node) {
          if (isLanguageString(node.object)) report(node, `.${name}()`);
        }
        if (name === "split" && node.parent.type === AST_NODE_TYPES.CallExpression && node.parent.callee === node) {
          const [sep] = node.parent.arguments;
          if (sep?.type === AST_NODE_TYPES.Literal && sep.value === "" && isLanguageString(node.object)) report(node, '.split("")');
        }
      },
      SpreadElement(node) {
        if (node.parent.type === AST_NODE_TYPES.ArrayExpression && isLanguageString(node.argument)) report(node, "[...s]");
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.object.type === AST_NODE_TYPES.Identifier &&
          callee.object.name === "Array" &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          callee.property.name === "from"
        ) {
          const [arg] = node.arguments;
          if (arg !== undefined && arg.type !== AST_NODE_TYPES.SpreadElement && isLanguageString(arg)) report(node, "Array.from(s)");
        }
      },
    };
  },
});
