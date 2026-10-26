import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runCli } from "../packages/cli/src/index.ts";
import { component, policy } from "./fixtures.ts";

const roots: string[] = [];
async function project(outcome: "pass" | "fail" | "skip" | "mutate" = "pass") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "governanator-vitest-")));
  roots.push(root);
  await Promise.all(["governance", "src", "tests"].map((path) => mkdir(join(root, path))));
  const files: Record<string, string> = {
    ".gitignore": "node_modules/\nartifacts/\n",
    "package.json": JSON.stringify({ type: "module", devDependencies: { vitest: "4.1.12" } }),
    "src/Button.ts": "export const buttonDisabled = (disabled: boolean) => disabled;\n",
    "vitest.config.ts": 'export default { test: { include: ["tests/*.test.ts"] } };\n',
    "tests/button.test.ts": `import {test,expect} from 'vitest';\nimport {buttonDisabled} from '../src/Button.ts';\n${outcome === "mutate" ? "import {writeFile} from 'node:fs/promises';\n" : ""}${outcome === "skip" ? "test.skip" : "test"}('disabled semantics', async () => {${outcome === "mutate" ? "await writeFile('src/Button.ts','export const modified = true;');" : ""} expect(buttonDisabled(true)).toBe(${outcome === "fail" ? "false" : "true"}); });\n`,
    "governance/components.yaml": JSON.stringify({
      schemaVersion: 1,
      components: [{ ...component, source: "src/Button.ts", stories: [] }],
    }),
    "governance/policy.yaml": JSON.stringify(policy),
    "governance/tests.json": JSON.stringify({
      schemaVersion: 1,
      mappings: [{ componentId: "ui.button", files: ["tests/button.test.ts"] }],
    }),
  };
  await Promise.all(
    Object.entries(files).map(([path, content]) => writeFile(join(root, path), content)),
  );
  await symlink(join(import.meta.dirname, "../node_modules"), join(root, "node_modules"));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", [
    "-C",
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "Tracked test project",
  ]);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const args = (root: string) => [
  "check",
  "--root",
  root,
  "--mapping",
  "governance/tests.json",
  "--format",
  "json",
];
describe("local Vitest producer and gate", () => {
  test("ignored governance registry or policy cannot receive source-bound decisions", async () => {
    const root = await project();
    execFileSync("git", [
      "-C",
      root,
      "rm",
      "--cached",
      "governance/components.yaml",
      "governance/policy.yaml",
    ]);
    await writeFile(
      join(root, ".gitignore"),
      "node_modules/\nartifacts/\ngovernance/components.yaml\ngovernance/policy.yaml\n",
    );
    execFileSync("git", ["-C", root, "add", ".gitignore"]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "Ignore undeclared governance",
    ]);
    expect(await runCli(args(root))).toMatchObject({
      code: 2,
      stderr: expect.stringMatching(/tracked|pathspec/i),
    });
  });
  test.each(["--assume-unchanged", "--skip-worktree"])(
    "%s cannot hide a tested source edit",
    async (flag) => {
      const root = await project();
      execFileSync("git", ["-C", root, "update-index", flag, "src/Button.ts"]);
      await writeFile(
        join(root, "src/Button.ts"),
        "export const buttonDisabled = (_disabled: boolean) => true;\n",
      );
      expect(await runCli(args(root))).toMatchObject({
        code: 2,
        stderr: expect.stringMatching(/index|assume|skip|hidden/i),
      });
    },
  );
  test("real passing process yields source-bound proof; re-importing its file never recreates trust", async () => {
    const root = await project();
    const result = await runCli(args(root));
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      assurance: "verified-inputs",
      publication: "unknown",
      decisions: [{ componentId: "ui.button", gate: "ready", checks: [{ result: "passed" }] }],
    });
    const receiptPath = result.stderr.trim().split(" ").at(-1)!;
    const receipt = JSON.parse(await readFile(join(root, receiptPath), "utf8"));
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      assurance: "local-process",
      runner: { name: "vitest", version: "4.1.12" },
    });
    expect(receipt.commit).toBe(
      execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    );
    const imported = await runCli([
      "evidence",
      "import",
      "--root",
      root,
      "--format",
      "vitest",
      "--file",
      receipt.reportPath,
      "--mapping",
      "governance/tests.json",
    ]);
    expect(imported.code).toBe(0);
    expect(JSON.parse(imported.stdout).evidence[0].provenance).toBe("unverified");
  });
  test("real failed tests block while real skipped tests yield insufficient evidence", async () => {
    const failed = await runCli(args(await project("fail")));
    expect(failed.code).toBe(1);
    expect(JSON.parse(failed.stdout).decisions[0].gate).toBe("blocked");
    const skipped = await runCli(args(await project("skip")));
    expect(skipped.code).toBe(1);
    expect(JSON.parse(skipped.stdout).decisions[0].gate).toBe("insufficient_evidence");
  });
  test("dirty inputs before running and mutations during execution cannot receive HEAD proof", async () => {
    const dirty = await project();
    await writeFile(join(dirty, "src/Button.ts"), "export const changed = true;");
    expect(await runCli(args(dirty))).toMatchObject({
      code: 2,
      stderr: expect.stringMatching(/dirty|uncommitted/i),
    });
    expect(await runCli(args(await project("mutate")))).toMatchObject({
      code: 2,
      stderr: expect.stringMatching(/dirty|changed|uncommitted/i),
    });
  });
  test("runner options cannot come from arbitrary shell commands or untrusted mappings", async () => {
    const root = await project();
    expect((await runCli([...args(root), "--command", "echo passed"])).code).toBe(2);
    expect((await runCli([...args(root), "--demo"])).code).toBe(2);
    expect(
      (
        await runCli([
          "evidence",
          "import",
          "--root",
          root,
          "--format",
          "magic",
          "--file",
          "governance/tests.json",
          "--mapping",
          "governance/tests.json",
        ])
      ).code,
    ).toBe(2);
  });
});
