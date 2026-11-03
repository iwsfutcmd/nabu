/**
 * Type-aware recognition of language data: values that come from a TaggedText,
 * Token, RubySegment or Morph (the @nabu/schema types), directly or through a
 * `const` alias or destructuring, or from a function such as surfaceOf().
 */
import { AST_NODE_TYPES, ASTUtils, ESLintUtils, type TSESLint, type TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";

export const LANGUAGE_DATA_TYPES = new Set(["TaggedText", "Token", "RubySegment", "Morph"]);
export const LANGUAGE_DATA_FUNCTIONS = new Set(["surfaceOf"]);

export const typeNamed = (type: ts.Type, names: ReadonlySet<string>): boolean => {
  if (type.isUnion() || type.isIntersection()) return type.types.some((t) => typeNamed(t, names));
  const symbol = type.aliasSymbol ?? type.getSymbol();
  return symbol !== undefined && names.has(symbol.getName());
};

/** String-like, ignoring null and undefined (optional chains and optional properties). */
export const isStringLike = (type: ts.Type): boolean => {
  if (!type.isUnion()) return (type.flags & ts.TypeFlags.StringLike) !== 0;
  const present = type.types.filter((t) => (t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) === 0);
  return present.length > 0 && present.every(isStringLike);
};

const unwrap = (node: TSESTree.Expression): TSESTree.Expression => {
  let n = node;
  while (
    n.type === AST_NODE_TYPES.TSNonNullExpression ||
    n.type === AST_NODE_TYPES.TSAsExpression ||
    n.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    n.type === AST_NODE_TYPES.ChainExpression
  ) {
    n = n.expression;
  }
  return n;
};

export const languageDataDetector = <M extends string, O extends readonly unknown[]>(
  context: Readonly<TSESLint.RuleContext<M, O>>,
) => {
  const services = ESLintUtils.getParserServices(context);
  const typeOf = (node: TSESTree.Node): ts.Type => services.getTypeAtLocation(node);

  const isLanguageData = (input: TSESTree.Expression, depth = 0): boolean => {
    const node = unwrap(input);
    if (depth > 4) return false;
    switch (node.type) {
      case AST_NODE_TYPES.MemberExpression: {
        // token.surface, segment.base, token.variants[0], text.tokens[0].surface …
        if (typeNamed(typeOf(node.object), LANGUAGE_DATA_TYPES)) return true;
        return node.computed && isLanguageData(node.object, depth + 1);
      }
      case AST_NODE_TYPES.CallExpression: {
        const callee = node.callee;
        const name =
          callee.type === AST_NODE_TYPES.Identifier
            ? callee.name
            : callee.type === AST_NODE_TYPES.MemberExpression && callee.property.type === AST_NODE_TYPES.Identifier
              ? callee.property.name
              : undefined;
        if (name !== undefined && LANGUAGE_DATA_FUNCTIONS.has(name)) return true;
        // .normalize(), .trim() … keep the value language data
        return (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          isStringLike(typeOf(node)) &&
          isLanguageData(callee.object, depth + 1)
        );
      }
      case AST_NODE_TYPES.Identifier: {
        const variable = ASTUtils.findVariable(context.sourceCode.getScope(node), node);
        const def = variable?.defs[0];
        if (def?.node.type !== AST_NODE_TYPES.VariableDeclarator) return false;
        const declarator = def.node;
        if (declarator.parent.kind !== "const" || declarator.init == null) return false;
        if (declarator.id.type === AST_NODE_TYPES.Identifier) return isLanguageData(declarator.init, depth + 1);
        // const { surface } = token
        return declarator.id.type === AST_NODE_TYPES.ObjectPattern && typeNamed(typeOf(declarator.init), LANGUAGE_DATA_TYPES);
      }
      default:
        return false;
    }
  };

  return { isLanguageData, typeOf };
};
