import ts from "typescript";
import { resolve } from "node:path";

export function inspectBoundaries(
  manifest: Record<string, unknown>,
  sources: readonly string[],
): readonly string[] {
  const errors: string[] = [];
  for (const key of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const values = manifest[key];
    if (values && typeof values === "object" && Object.keys(values).length)
      errors.push(`Protocol must have no ${key}`);
  }
  for (const source of sources) {
    const ast = ts.createSourceFile("protocol.ts", source, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        !node.moduleSpecifier.text.startsWith(".")
      )
        errors.push(`External protocol import: ${node.moduleSpecifier.text}`);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      )
        errors.push("Dynamic protocol import is forbidden");
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return errors;
}
if (import.meta.main) {
  const root = resolve(import.meta.dirname, "..");
  const manifest: Record<string, unknown> = await Bun.file(
    resolve(root, "packages/protocol/package.json"),
  ).json();
  const sources: string[] = [];
  for await (const path of new Bun.Glob("packages/protocol/{src,dist}/**/*.{ts,mts,js,mjs}").scan({
    cwd: root,
  }))
    sources.push(await Bun.file(resolve(root, path)).text());
  const errors = inspectBoundaries(manifest, sources);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("Protocol dependency/import boundary is clean");
}
