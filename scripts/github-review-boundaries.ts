import ts from "typescript";

/** Private reader must obtain network access only through its caller-supplied transport. */
export function inspectGithubReader(source: string): string[] {
  const errors: string[] = [];
  const ast = ts.createSourceFile("github-review.ts", source, ts.ScriptTarget.Latest, true);
  const forbidden = new Set(["fetch", "process", "Bun", "WebSocket", "XMLHttpRequest", "require"]);
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const name = node.moduleSpecifier.text;
      if (!name.startsWith(".") && name !== "effect" && name !== "@governanator/core")
        errors.push(`Forbidden reader import: ${name}`);
    }
    if (ts.isIdentifier(node) && forbidden.has(node.text))
      errors.push(`Forbidden ambient capability: ${node.text}`);
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "globalThis" &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression) &&
      forbidden.has(node.argumentExpression.text)
    )
      errors.push(`Forbidden ambient capability: ${node.argumentExpression.text}`);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      errors.push("Dynamic reader import is forbidden");
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return errors;
}
if (import.meta.main) {
  const errors: string[] = [];
  let count = 0;
  for await (const path of new Bun.Glob("packages/github-review/src/**/*.ts").scan(".")) {
    count++;
    errors.push(...inspectGithubReader(await Bun.file(path).text()));
  }
  if (!count) errors.push("GitHub reader sources are missing");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("GitHub reader static dependency and ambient capability checks pass");
}
