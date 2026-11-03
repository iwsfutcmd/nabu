import ts from "typescript";

/** Insert `readonly` wherever TypeScript allows it, by position, so comments and formatting survive. */
export const makeReadonly = (source: string): string => {
  const file = ts.createSourceFile("schema.ts", source, ts.ScriptTarget.Latest, true);
  const inserts: number[] = [];
  const hasReadonly = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword);
  const visit = (node: ts.Node): void => {
    if ((ts.isPropertySignature(node) || ts.isIndexSignatureDeclaration(node)) && !hasReadonly(node)) {
      inserts.push(node.getStart(file));
    }
    if (ts.isArrayTypeNode(node) || ts.isTupleTypeNode(node)) {
      const parent = node.parent;
      const alreadyReadonly =
        ts.isTypeOperatorNode(parent) && parent.operator === ts.SyntaxKind.ReadonlyKeyword;
      if (!alreadyReadonly) inserts.push(node.getStart(file));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  let out = source;
  for (const pos of [...new Set(inserts)].sort((a, b) => b - a)) {
    out = `${out.slice(0, pos)}readonly ${out.slice(pos)}`;
  }
  return out;
};
