/**
 * No literal UI strings in JSX or TS: everything users read goes through MF2
 * messages (gameplan §11.9). A string is "UI text" when it contains a letter
 * (\p{L}) and sits where users will see or hear it: JSX text, a JSX child
 * expression, a user-facing attribute (aria-label, title, placeholder…), a DOM
 * text property, setAttribute on such an attribute, or alert/confirm/prompt.
 */
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule.ts";

const UI_ATTRIBUTES = [
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "description",
  "errorMessage",
  "label",
  "placeholder",
  "title",
  "valueLabel",
];
const DOM_TEXT_PROPERTIES = new Set([
  "alt",
  "ariaDescription",
  "ariaLabel",
  "ariaPlaceholder",
  "ariaRoleDescription",
  "ariaValueText",
  "innerHTML",
  "innerText",
  "outerHTML",
  "placeholder",
  "textContent",
  "title",
]);
const DIALOGS = new Set(["alert", "confirm", "prompt"]);
const LETTER = /\p{L}/u;

type Options = [{ attributes?: string[]; allow?: string[] }];
type MessageIds = "jsxText" | "attribute" | "expression";

/** Every string literal an expression can evaluate to (through ?:, && and ||). */
const literalStrings = (node: TSESTree.Node | null | undefined): { node: TSESTree.Node; value: string }[] => {
  if (node == null) return [];
  switch (node.type) {
    case AST_NODE_TYPES.Literal:
      return typeof node.value === "string" ? [{ node, value: node.value }] : [];
    case AST_NODE_TYPES.TemplateLiteral:
      return [{ node, value: node.quasis.map((q) => q.value.cooked ?? "").join(" ") }];
    case AST_NODE_TYPES.ConditionalExpression:
      return [...literalStrings(node.consequent), ...literalStrings(node.alternate)];
    case AST_NODE_TYPES.LogicalExpression:
      return [...literalStrings(node.left), ...literalStrings(node.right)];
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return literalStrings(node.expression);
    default:
      return [];
  }
};

const attributeName = (name: TSESTree.JSXAttribute["name"]): string =>
  name.type === AST_NODE_TYPES.JSXNamespacedName ? `${name.namespace.name}:${name.name.name}` : name.name;

export default createRule<Options, MessageIds>({
  name: "no-literal-ui-strings",
  meta: {
    type: "problem",
    docs: { description: "Disallow literal user-facing strings; use MF2 messages from @nabu/i18n." },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          attributes: { type: "array", items: { type: "string" } },
          allow: { type: "array", items: { type: "string" } },
        },
      },
    ],
    messages: {
      jsxText: "Literal UI text {{text}}. Add an MF2 message to packages/i18n/messages and render it with the translator.",
      attribute: "Literal string in user-facing attribute `{{name}}`. Use a message from the translator.",
      expression: "Literal UI string {{text}}. Use a message from the translator.",
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const attributes = new Set(options.attributes ?? UI_ATTRIBUTES);
    const allow = (options.allow ?? []).map((source) => new RegExp(source, "u"));
    const isUiText = (value: string): boolean => LETTER.test(value) && !allow.some((r) => r.test(value.trim()));
    const show = (value: string): string => JSON.stringify(value.trim().slice(0, 40));

    const checkExpression = (expr: TSESTree.Node | null | undefined, messageId: "attribute" | "expression", name = ""): void => {
      for (const { node, value } of literalStrings(expr)) {
        if (isUiText(value)) context.report({ node, messageId, data: { name, text: show(value) } });
      }
    };

    return {
      JSXText(node) {
        if (isUiText(node.value)) context.report({ node, messageId: "jsxText", data: { text: show(node.value) } });
      },
      JSXAttribute(node) {
        const name = attributeName(node.name);
        if (!attributes.has(name) || node.value === null) return;
        const expr = node.value.type === AST_NODE_TYPES.JSXExpressionContainer ? node.value.expression : node.value;
        if (expr.type === AST_NODE_TYPES.JSXEmptyExpression) return;
        checkExpression(expr, "attribute", name);
      },
      JSXExpressionContainer(node) {
        const parent = node.parent;
        if (parent.type !== AST_NODE_TYPES.JSXElement && parent.type !== AST_NODE_TYPES.JSXFragment) return;
        if (node.expression.type === AST_NODE_TYPES.JSXEmptyExpression) return;
        checkExpression(node.expression, "expression");
      },
      AssignmentExpression(node) {
        const left = node.left;
        if (left.type !== AST_NODE_TYPES.MemberExpression || left.computed) return;
        if (left.property.type === AST_NODE_TYPES.Identifier && DOM_TEXT_PROPERTIES.has(left.property.name)) {
          checkExpression(node.right, "expression");
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        const name =
          callee.type === AST_NODE_TYPES.Identifier
            ? callee.name
            : callee.type === AST_NODE_TYPES.MemberExpression && callee.property.type === AST_NODE_TYPES.Identifier
              ? callee.property.name
              : undefined;
        if (name !== undefined && DIALOGS.has(name)) checkExpression(node.arguments[0], "expression");
        if (name === "setAttribute") {
          const [attr, value] = node.arguments;
          if (attr?.type === AST_NODE_TYPES.Literal && typeof attr.value === "string" && attributes.has(attr.value)) {
            checkExpression(value, "attribute", attr.value);
          }
        }
      },
    };
  },
});
