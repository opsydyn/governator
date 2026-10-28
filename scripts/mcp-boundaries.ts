import ts from "typescript";
export function inspectReadonlyQuery(source: string): string[] {
  const errors: string[] = [],
    ast = ts.createSourceFile("query.ts", source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const name = node.moduleSpecifier.text;
      if (
        ![
          "effect",
          "@governator/core",
          "./domain.ts",
          "./values.ts",
          "./governance.ts",
          "./requests.ts",
        ].includes(name)
      )
        errors.push(`Unexpected query import: ${name}`);
    }
    if (
      ts.isIdentifier(node) &&
      [
        "Bun",
        "process",
        "fetch",
        "XMLHttpRequest",
        "WebSocket",
        "require",
        "eval",
        "Function",
      ].includes(node.text)
    )
      errors.push(`Executable IO in query: ${node.text}`);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      errors.push("Dynamic query import");
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return errors;
}
if (import.meta.main) {
  const errors: string[] = [];
  for (const file of ["service", "governance", "requests", "values"])
    errors.push(...inspectReadonlyQuery(await Bun.file(`packages/query/src/${file}.ts`).text()));
  for await (const file of new Bun.Glob("{packages,apps}/*/package.json").scan(".")) {
    const manifest = await Bun.file(file).json();
    for (const key of ["dependencies", "peerDependencies", "optionalDependencies"])
      for (const name of Object.keys(manifest[key] ?? {}))
        if (name.startsWith("@modelcontextprotocol/") && file !== "packages/mcp/package.json")
          errors.push(`MCP runtime leaked into ${file}`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Readonly query IO and MCP dependency boundaries are clean");
}
