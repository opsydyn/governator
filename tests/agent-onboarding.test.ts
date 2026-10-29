/* oxlint-disable linteffect/no-return-in-arrow, linteffect/no-naked-object-state-update -- Disposable onboarding fixtures. */
import { afterEach, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { runCli } from "../packages/cli/src/index.ts";
import { component, policy } from "./fixtures.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "governator-onboard-")));
  roots.push(root);
  await mkdir(join(root, "fixtures"));
  await writeFile(join(root, "fixtures/Button.ts"), "export {};");
  await writeFile(join(root, "fixtures/Button.stories.ts"), "export default {};");
  await writeFile(join(root, "fixtures/button.test.ts"), "export {};");
  await writeFile(join(root, "package.json"), '{"name":"consumer","type":"module"}');
  const setup = {
    registry: { schemaVersion: 1, components: [component] },
    policy,
    mapping: {
      schemaVersion: 1,
      mappings: [{ componentId: component.id, files: ["fixtures/button.test.ts"] }],
    },
  };
  await writeFile(join(root, "setup.json"), JSON.stringify(setup));
  return { root, setup };
}

test("setup plan is read-only; apply validates the selected plan and refuses overwrites", async () => {
  const { root, setup } = await fixture();
  const plan = await runCli(["init", "plan", "--root", root, "--config", "setup.json"]);
  expect(plan.code, plan.stderr).toBe(0);
  expect(await Bun.file(join(root, "governance/components.yaml")).exists()).toBe(false);
  const selected = JSON.parse(plan.stdout);
  expect(selected.files).toHaveLength(3);
  const original = JSON.stringify(setup);
  await writeFile(
    join(root, "setup.json"),
    JSON.stringify({ ...setup, policy: { ...policy, policyVersion: "changed" } }),
  );
  expect(
    (
      await runCli([
        "init",
        "apply",
        "--root",
        root,
        "--config",
        "setup.json",
        "--revision",
        selected.revision,
      ])
    ).code,
  ).toBe(2);
  expect(await Bun.file(join(root, "governance/components.yaml")).exists()).toBe(false);
  await writeFile(join(root, "setup.json"), original);
  const apply = [
    "init",
    "apply",
    "--root",
    root,
    "--config",
    "setup.json",
    "--revision",
    selected.revision,
  ];
  expect((await runCli([...apply.slice(0, -1), "0".repeat(64)])).code).toBe(2);
  const result = await runCli(apply);
  expect(result.code, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(root, "governance/components.yaml"), "utf8"))).toEqual(
    setup.registry,
  );
  expect((await runCli(apply)).code).toBe(2);
  expect((await runCli(["validate", "--root", root])).code).toBe(0);
});

test("setup rejects missing paths, missing ownership and symlinked output directories", async () => {
  const { root, setup } = await fixture();
  setup.registry.components[0] = { ...component, owners: [] };
  await writeFile(join(root, "setup.json"), JSON.stringify(setup));
  expect((await runCli(["init", "plan", "--root", root, "--config", "setup.json"])).code).toBe(2);
  setup.registry.components[0] = component;
  await writeFile(join(root, "setup.json"), JSON.stringify(setup));
  await symlink(join(root, "fixtures"), join(root, "governance"));
  expect((await runCli(["init", "plan", "--root", root, "--config", "setup.json"])).code).toBe(2);
});

test("capability discovery describes new commands and their effects without changing source", async () => {
  const { root } = await fixture();
  const result = await runCli(["capabilities", "--root", root, "--format", "json"]);
  expect(result.code, result.stderr).toBe(0);
  const capabilities = JSON.parse(result.stdout);
  expect(capabilities.schemaVersion).toBe(1);
  expect(
    capabilities.commands.find((entry: { command: string }) => entry.command === "snapshot.refresh")
      .effects,
  ).toContain("execute-producers");
  expect(
    capabilities.commands.find((entry: { command: string }) => entry.command === "init.apply")
      .options,
  ).toContain("--revision");
  expect(capabilities.mcp.tools).toContain("list_ready_components");
});

test("skill export includes setup reference, rejects existing destinations and symlinked parents", async () => {
  const { root } = await fixture();
  const args = ["skill", "export", "--root", root, "--out", ".agents/skills/governator-onboarding"];
  const result = await runCli(args);
  expect(result.code, result.stderr).toBe(0);
  expect(
    await readFile(join(root, ".agents/skills/governator-onboarding/SKILL.md"), "utf8"),
  ).toContain("name: governator-onboarding");
  expect(
    await Bun.file(join(root, ".agents/skills/governator-onboarding/references/setup.md")).exists(),
  ).toBe(true);
  expect((await runCli(args)).code).toBe(2);
  await symlink(resolve(root, "fixtures"), join(root, "linked"));
  expect((await runCli(["skill", "export", "--root", root, "--out", "linked/skill"])).code).toBe(2);
});

test("CLI-only diagnostics do not fail because optional integrations are missing", async () => {
  const { root } = await fixture();
  const plan = await runCli(["init", "plan", "--root", root, "--config", "setup.json"]);
  expect(
    (
      await runCli([
        "init",
        "apply",
        "--root",
        root,
        "--config",
        "setup.json",
        "--revision",
        JSON.parse(plan.stdout).revision,
      ])
    ).code,
  ).toBe(0);
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
    "Initial setup",
  ]);
  const cli = await runCli(["doctor", "--root", root, "--format", "json"]);
  expect(cli.code, cli.stderr).toBe(0);
  const diagnostics = JSON.parse(cli.stdout);
  expect(
    diagnostics.findings.find(
      (item: { id: string }) => item.id === "dependency:@opsydyn/governator-mcp",
    ).status,
  ).toBe("optional");
  expect(diagnostics.findings.find((item: { id: string }) => item.id === "snapshot").status).toBe(
    "unassessed",
  );
  const evidence = await runCli([
    "doctor",
    "--root",
    root,
    "--format",
    "json",
    "--workflow",
    "evidence",
  ]);
  expect(evidence.code).toBe(1);
  await writeFile(join(root, "fixtures/Button.ts"), "export const changed=true;");
  const dirty = JSON.parse((await runCli(["doctor", "--root", root, "--format", "json"])).stdout);
  expect(
    dirty.findings.find((item: { id: string }) => item.id === "source").remediation[0],
  ).toMatchObject({
    kind: "command",
    executable: "git",
    args: ["-C", root, "status", "--short"],
    effects: ["read"],
  });
});
