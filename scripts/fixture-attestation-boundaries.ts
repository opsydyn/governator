import ts from "typescript";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Keep the fixture verifier offline and confined to its own sources. */
export function inspectFixtureAttestation(
  source: string,
  allowedIndexExpression: (expression: ts.BinaryExpression) => boolean = () => false,
): string[] {
  const errors: string[] = [];
  const ast = ts.createSourceFile("fixture-attestation.ts", source, ts.ScriptTarget.Latest, true);
  const forbidden = new Set([
    "console",
    "constructor",
    "fetch",
    "process",
    "Bun",
    "Deno",
    "WebSocket",
    "XMLHttpRequest",
    "EventSource",
    "Worker",
    "SharedWorker",
    "navigator",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "caches",
    "globalThis",
    "global",
    "window",
    "self",
    "require",
    "module",
    "eval",
    "Function",
  ]);
  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) errors.push("Invalid module specifier");
      else {
        const name = node.moduleSpecifier.text;
        const local = /^\.\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*(?:\.(?:ts|js))?$/.test(name);
        if (!local && name !== "effect" && name !== "node:crypto")
          errors.push(`Forbidden fixture verifier import: ${name}`);
      }
    }
    if (ts.isIdentifier(node) && node.text === "Reflect") {
      const member = node.parent;
      if (
        !ts.isPropertyAccessExpression(member) ||
        member.expression !== node ||
        member.name.text !== "ownKeys" ||
        !ts.isCallExpression(member.parent) ||
        member.parent.expression !== member
      )
        errors.push("Only direct Reflect.ownKeys calls are allowed");
    }
    if (ts.isStringLiteralLike(node) && node.text === "constructor")
      errors.push("Fixture verifier constructor access is forbidden");
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword)
      errors.push("Fixture verifier import.meta is forbidden");
    if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      ((ts.isStringLiteralLike(node.argumentExpression) &&
        node.argumentExpression.text === "constructor") ||
        (ts.isBinaryExpression(node.argumentExpression) &&
          !allowedIndexExpression(node.argumentExpression)) ||
        ts.isTemplateExpression(node.argumentExpression))
    )
      errors.push("Fixture verifier dynamic property access is forbidden");
    if (ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node))
      errors.push("Alternate fixture verifier import is forbidden");
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      errors.push("Dynamic fixture verifier import is forbidden");
    if (ts.isIdentifier(node) && forbidden.has(node.text))
      errors.push(`Forbidden fixture verifier ambient capability: ${node.text}`);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return errors;
}

export function inspectFixtureManifest(manifest: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (manifest.private !== true) errors.push("Fixture verifier must remain private");
  for (const key of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const dependencies = manifest[key];
    if (dependencies && typeof dependencies === "object")
      for (const name of Object.keys(dependencies))
        if (key !== "dependencies" || name !== "effect")
          errors.push(`Unexpected fixture verifier dependency: ${name}`);
  }
  return errors;
}

/** Inspect the entire source tree, rejecting files we cannot inspect and symbolic links. */
export async function inspectFixtureSources(
  root: string,
  inspect: (source: string) => string[] = inspectFixtureAttestation,
): Promise<string[]> {
  const errors: string[] = [];
  let count = 0;
  async function visit(path: string): Promise<void> {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      errors.push(`Fixture verifier source symlink is forbidden: ${path}`);
    } else if (stat.isDirectory()) {
      for (const name of await readdir(path)) await visit(join(path, name));
    } else if (!stat.isFile() || !path.endsWith(".ts")) {
      errors.push(`Unexpected fixture verifier source file: ${path}`);
    } else {
      count++;
      errors.push(...inspect(await readFile(path, "utf8")));
    }
  }
  await visit(root);
  if (!count) errors.push("Fixture verifier sources are missing");
  return errors;
}

if (import.meta.main) {
  const manifest: Record<string, unknown> = await Bun.file(
    "packages/fixture-attestation/package.json",
  ).json();
  const errors = [
    ...inspectFixtureManifest(manifest),
    ...(await inspectFixtureSources("packages/fixture-attestation/src")),
  ];
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Fixture verifier static dependency and ambient capability checks pass");
}
