import ts from "typescript";
import { queryEnsure } from "./domain.ts";
/** The offline single-entrypoint fixture supports only its external React type import. */
export function assertSafeApi(declaration: string): void {
  const source = ts.createSourceFile("snapshot-api.ts", declaration, ts.ScriptTarget.Latest, true);
  queryEnsure(
    source.referencedFiles.length === 0 &&
      source.typeReferenceDirectives.length === 0 &&
      source.libReferenceDirectives.length === 0,
    "Declaration reference directives are unsupported",
  );
  function moduleName(name: string) {
    queryEnsure(name === "react", `Unsupported declaration import: ${name}`);
  }
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      moduleName(node.moduleSpecifier.text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      moduleName(node.argument.literal.text);
    if (
      ts.isExternalModuleReference(node) &&
      node.expression &&
      ts.isStringLiteral(node.expression)
    )
      moduleName(node.expression.text);
    queryEnsure(
      !(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword),
      "Dynamic declaration imports are unsupported",
    );
    ts.forEachChild(node, visit);
  }
  visit(source);
}
