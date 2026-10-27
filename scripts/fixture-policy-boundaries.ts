import ts from "typescript";
import {
  inspectFixtureAttestation,
  inspectFixtureManifest,
  inspectFixtureSources,
} from "./fixture-attestation-boundaries.ts";

/** Targeted static checks for common imports and ambient capabilities; not a sandbox. */
export function inspectFixturePolicy(source: string): string[] {
  // Subtraction coerces to a number; the policy also indexes after Array.indexOf.
  const errors = inspectFixtureAttestation(
    source,
    (expression) =>
      expression.operatorToken.kind === ts.SyntaxKind.MinusToken ||
      (expression.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        ts.isNumericLiteral(expression.right) &&
        ts.isCallExpression(expression.left) &&
        ts.isPropertyAccessExpression(expression.left.expression) &&
        expression.left.expression.name.text === "indexOf"),
  );
  const ast = ts.createSourceFile("fixture-policy.ts", source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "effect"
    )
      errors.push("Fixture policy cannot import Effect");
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return errors;
}

export function inspectPolicyManifest(manifest: Record<string, unknown>): string[] {
  const errors = inspectFixtureManifest(manifest);
  for (const key of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const dependencies = manifest[key];
    if (dependencies && typeof dependencies === "object" && "effect" in dependencies)
      errors.push("Fixture policy cannot depend on Effect");
  }
  return errors;
}

export function inspectPolicySources(root: string): Promise<string[]> {
  return inspectFixtureSources(root, inspectFixturePolicy);
}

if (import.meta.main) {
  const manifest: Record<string, unknown> = await Bun.file(
    "packages/fixture-policy/package.json",
  ).json();
  const errors = [
    ...inspectPolicyManifest(manifest),
    ...(await inspectPolicySources("packages/fixture-policy/src")),
  ];
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Fixture policy static dependency and ambient capability checks pass");
}
