import ts from "typescript";
import { gzipSync } from "node:zlib";
export function inspectAddon(
  manifest: Record<string, unknown>,
  sources: readonly string[],
): string[] {
  const errors: string[] = [];
  for (const key of ["dependencies", "optionalDependencies", "bundledDependencies"])
    if (manifest[key] && Object.keys(manifest[key] as object).length)
      errors.push(`Addon must have no ${key}`);
  const peers = Object.keys((manifest.peerDependencies ?? {}) as object);
  if (peers.length !== 1 || peers[0] !== "storybook") errors.push("Only Storybook may be a peer");
  for (const source of sources) {
    const ast = ts.createSourceFile(
      "addon.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node: ts.Node): void {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const name = node.moduleSpecifier.text;
        const typeOnly =
          (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
          (ts.isExportDeclaration(node) && node.isTypeOnly);
        if (
          !name.startsWith(".") &&
          !/^storybook(?:\/|$)/.test(name) &&
          name !== "react" &&
          !(typeOnly && name === "@governanator/protocol")
        )
          errors.push(`Forbidden addon import ${name}`);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      )
        errors.push("Dynamic addon dependency is forbidden");
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return errors;
}
if (import.meta.main) {
  const sources: string[] = [];
  // The freshness-checked Ajv source has one compile-time helper require; tsdown must bundle it.
  // Check the shipped bundle too, where no external helper require may remain.
  for await (const path of new Bun.Glob(
    "packages/storybook-addon/{src,dist}/**/*.{ts,tsx,mts,js,mjs}",
  ).scan("."))
    if (!path.endsWith("/generated-validator.mjs")) sources.push(await Bun.file(path).text());
  const errors = inspectAddon(
    await Bun.file("packages/storybook-addon/package.json").json(),
    sources,
  );
  const manager = Bun.file("packages/storybook-addon/dist/manager.js");
  if (!(await manager.exists())) errors.push("Build addon before checking its shipped bundle");
  else {
    const bytes = await manager.bytes();
    const gzip = gzipSync(bytes).length;
    console.log(
      `Addon manager: ${bytes.length} bytes / ${gzip} bytes gzip (budget 131072 / 16384)`,
    );
    if (bytes.length > 131072 || gzip > 16384) errors.push("Addon manager exceeds bundle budget");
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Addon dependency/import boundary and bundle budget pass");
}
