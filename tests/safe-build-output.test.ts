import { expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import cli from "../packages/cli/tsdown.config.ts";
import mcp from "../packages/mcp/tsdown.config.ts";

for (const [name, config] of [
  ["cli", cli],
  ["mcp", mcp],
] as const) {
  test(`${name} guards resolved output and clean overrides before any cleanup`, async () => {
    const root = await mkdtemp("/private/tmp/governator-resolved-output-");
    await (async () => {
      await mkdir(`${root}/retained`);
      await writeFile(`${root}/retained/sentinel`, "retained");
      await symlink(`${root}/retained`, `${root}/linked`);
      const prepare = (config as { hooks?: { "build:prepare"?: (context: unknown) => unknown } })
        .hooks?.["build:prepare"];
      expect(prepare).toBeTypeOf("function");
      if (!prepare) throw new Error("Missing prepare hook");
      for (const outDir of [`${root}/linked`, `${root}/linked/nested`])
        expect(() => prepare({ options: { cwd: root, outDir, clean: [outDir] } })).toThrow(
          /linked build output/,
        );
      expect(() =>
        prepare({ options: { cwd: root, outDir: `${root}/dist`, clean: [`${root}/retained/**`] } }),
      ).toThrow(/clean override/);
      // Run only after the pre-clean guard has rejected these same paths above.
      // The sentinel is retained evidence; no unguarded destructive reproduction is run.
      for (const outDir of [`${root}/linked`, `${root}/linked/nested`]) {
        const child = Bun.spawnSync([process.execPath, "run", "build", "--out-dir", outDir], {
          cwd: `${process.cwd()}/packages/${name}`,
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(child.exitCode).not.toBe(0);
        expect(child.stderr.toString()).toContain("Refusing to clean linked build output");
        expect(await readFile(`${root}/retained/sentinel`, "utf8")).toBe("retained");
      }
      expect(await readFile(`${root}/retained/sentinel`, "utf8")).toBe("retained");
    })().finally(() => rm(root, { recursive: true, force: true }));
  });
}
