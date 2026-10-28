import { join } from "node:path";
import { tmpdir } from "node:os";
import { extract } from "tar";
import { assertSafeBuildOutput } from "../scripts/safe-build-output.ts";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";

for (const name of ["cli", "mcp"]) {
  describe(`${name} consumer distribution`, () => {
    test("declares a public release candidate and conventional Bun runtime boundary", async () => {
      const manifest = JSON.parse(await readFile(`packages/${name}/package.json`, "utf8"));
      expect(manifest.private).toBe(false);
      expect(manifest.version).toBe("0.1.0");
      expect(manifest.engines.bun).toBe(">=1.4.2");
      expect(Object.keys(manifest.dependencies)).not.toContain("effect");
      expect(
        Object.keys(manifest.dependencies).some((value) => value.startsWith("@governator/")),
      ).toBe(false);
      if (name === "cli") expect(manifest.dependencies.typescript).toBe("5.9.3");
    });
    test("built runtime and declarations contain no unresolved private or Effect imports", async () => {
      const files = (await readdir(`packages/${name}/dist`)).filter((file) =>
        /\.(?:mjs|mts)$/.test(file),
      );
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const source = await readFile(`packages/${name}/dist/${file}`, "utf8");
        const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
        function inspect(node: ts.Node): void {
          if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
          )
            expect(node.moduleSpecifier.text).not.toMatch(/^(?:@governator\/|effect(?:\/|$))/);
          if (
            ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
              node.expression.getText(ast) === "require") &&
            node.arguments[0] &&
            ts.isStringLiteral(node.arguments[0])
          )
            expect(node.arguments[0].text).not.toMatch(/^(?:@governator\/|effect(?:\/|$))/);
          ts.forEachChild(node, inspect);
        }
        inspect(ast);
      }
    });
  });
}

test("strict public declarations can be imported without workspace path aliases", () => {
  const consumer = join(tmpdir(), `governator-distribution-types-${process.pid}.mts`);
  const source = `import { runCli } from ${JSON.stringify(`${process.cwd()}/packages/cli/dist/index.mjs`)};
import { createMcpServer } from ${JSON.stringify(`${process.cwd()}/packages/mcp/dist/server.mjs`)};
const result: Promise<{ readonly code: 0 | 1 | 2; readonly stdout: string; readonly stderr: string }> = runCli([]);
createMcpServer({ query: () => ({ scope: "recorded-unverified", provenance: "local" }) });
void result;`;
  const host = ts.createCompilerHost({});
  const originalRead = host.readFile;
  host.readFile = (path) => (path === consumer ? source : originalRead(path));
  const originalExists = host.fileExists;
  host.fileExists = (path) => path === consumer || originalExists(path);
  const program = ts.createProgram(
    [consumer],
    {
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      types: ["bun"],
      typeRoots: [`${process.cwd()}/node_modules/@types`],
    },
    host,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(
    diagnostics.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, "\n")),
  ).toEqual([]);
}, 30000);

test("packed manifests, exports and Bun bins retain the distribution contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "governator-packed-boundary-"));
  await (async () => {
    for (const name of ["cli", "mcp"]) {
      const child = Bun.spawnSync(
        [process.execPath, "pm", "pack", "--ignore-scripts", "--destination", root],
        {
          cwd: `${process.cwd()}/packages/${name}`,
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      const unpacked = `${root}/${name}`;
      await mkdir(unpacked);
      await extract({ file: `${root}/governator-${name}-0.1.0.tgz`, cwd: unpacked });
      const pkg = `${unpacked}/package`;
      const manifest = JSON.parse(await readFile(`${pkg}/package.json`, "utf8"));
      expect(manifest.private).toBe(false);
      expect(await readFile(`${pkg}/THIRD_PARTY_NOTICES.md`, "utf8")).toContain(
        "Copyright (c) 2023 Effectful Technologies Inc",
      );
      expect(manifest.engines.bun).toBe(">=1.4.2");
      expect(
        Object.keys(manifest.dependencies).some(
          (value) => value.startsWith("@governator/") || value === "effect",
        ),
      ).toBe(false);
      for (const target of Object.values(manifest.exports["."]) as string[])
        expect((await readFile(`${pkg}/${target}`)).length).toBeGreaterThan(0);
      expect(await readFile(`${pkg}/dist/main.mjs`, "utf8")).toMatch(/^#!\/usr\/bin\/env bun\n/);
    }
  })().finally(() => rm(root, { recursive: true, force: true }));
});

test("output cleaning refuses nested links before touching their targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "governator-safe-output-"));
  await (async () => {
    await mkdir(`${root}/output`);
    await mkdir(`${root}/retained`);
    await writeFile(`${root}/retained/proof`, "retain");
    await symlink(`${root}/retained`, `${root}/output/node_modules`);
    expect(() => assertSafeBuildOutput(`${root}/output`)).toThrow(
      "Refusing to clean linked build output",
    );
    expect(await readFile(`${root}/retained/proof`, "utf8")).toBe("retain");
  })().finally(() => rm(root, { recursive: true, force: true }));
});
