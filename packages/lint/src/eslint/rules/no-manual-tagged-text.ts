/**
 * Language data reaches the DOM only through <T> (gameplan §11.1, §11.9):
 * rendering code must not reach into TaggedText.tokens or a Token's text and
 * render it by hand, which would lose lang, dir, fonts and whole-token
 * wrapping. Type-aware. Enable it for UI code and turn it off for the <T>
 * implementation itself.
 */
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { createRule } from "../create-rule.ts";
import { languageDataDetector, typeNamed } from "../language-data.ts";

const TAGGED_TEXT = new Set(["TaggedText"]);
const TOKEN_PARTS = new Set(["Token", "RubySegment", "Morph"]);
const TOKEN_TEXT_FIELDS = new Set(["surface", "base", "text", "ruby", "readings", "variants", "ipa", "morphs"]);

export default createRule<[], "tokens" | "tokenText">({
  name: "no-manual-tagged-text",
  meta: {
    type: "problem",
    docs: { description: "Render TaggedText only through <T>.", requiresTypeChecking: true },
    schema: [],
    messages: {
      tokens: "Don't take TaggedText apart in UI code. Render it with <T>, or split it with a helper from @nabu/core/text (tileGroups…).",
      tokenText: "Don't render a token's `{{field}}` by hand; render the TaggedText with <T>.",
    },
  },
  defaultOptions: [],
  create(context) {
    const { typeOf } = languageDataDetector(context);
    return {
      MemberExpression(node) {
        if (node.computed || node.property.type !== AST_NODE_TYPES.Identifier) return;
        const field = node.property.name;
        if (field === "tokens" && typeNamed(typeOf(node.object), TAGGED_TEXT)) context.report({ node, messageId: "tokens" });
        else if (TOKEN_TEXT_FIELDS.has(field) && typeNamed(typeOf(node.object), TOKEN_PARTS)) {
          context.report({ node, messageId: "tokenText", data: { field } });
        }
      },
      VariableDeclarator(node) {
        if (node.id.type !== AST_NODE_TYPES.ObjectPattern || node.init == null) return;
        const type = typeOf(node.init);
        for (const prop of node.id.properties) {
          if (prop.type !== AST_NODE_TYPES.Property || prop.key.type !== AST_NODE_TYPES.Identifier) continue;
          if (prop.key.name === "tokens" && typeNamed(type, TAGGED_TEXT)) context.report({ node: prop, messageId: "tokens" });
          if (TOKEN_TEXT_FIELDS.has(prop.key.name) && typeNamed(type, TOKEN_PARTS)) {
            context.report({ node: prop, messageId: "tokenText", data: { field: prop.key.name } });
          }
        }
      },
    };
  },
});
