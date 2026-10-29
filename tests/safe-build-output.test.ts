import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import cli from "../packages/cli/tsdown.config.ts";
import mcp from "../packages/mcp/tsdown.config.ts";

for (const [name, config] of [
  ["cli", cli],
  ["mcp", mcp],
] as const) {
  test(`${name} guards resolved output and clean overrides before any cleanup`, async () => {
    const root = await mkdtemp(join(tmpdir(), "governator-resolved-output-"));
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
      if (name === "cli") {
        const output = join(await realpath(root), "safe-output");
        const built = Bun.spawnSync([process.execPath, "run", "build", "--out-dir", output], {
          cwd: `${process.cwd()}/packages/cli`,
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(built.exitCode, built.stderr.toString()).toBe(0);
        expect(await Bun.file(join(output, "main.mjs")).exists()).toBe(true);
        expect(
          await Bun.file(join(output, "skills/governator-onboarding/SKILL.md")).text(),
        ).toContain("name: governator-onboarding");
      }
    })().finally(() => rm(root, { recursive: true, force: true }));
  });
}
