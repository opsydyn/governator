import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runCli } from "../packages/cli/src/index.ts";
import { at, registry, policy, evidence } from "./fixtures.ts";

const dirs: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "governanator-"));
  dirs.push(root);
  await mkdir(join(root, "governance"));
  await mkdir(join(root, "fixtures"));
  await Promise.all(
    ["Button.ts", "Button.stories.ts"].map((file) =>
      writeFile(join(root, "fixtures", file), "export {};\n"),
    ),
  );
  await Promise.all(
    Object.entries({
      "components.yaml": registry,
      "policy.yaml": policy,
      "evidence.json": [evidence],
      "waivers.json": [],
    }).map(([name, value]) => writeFile(join(root, "governance", name), JSON.stringify(value))),
  );
  return root;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
describe("offline CLI", () => {
  test("rejects in-root source and configuration symlinks whose targets escape Git path checks", async () => {
    const root = await fixture();
    await mkdir(join(root, "actual"));
    await writeFile(join(root, "actual/Button.ts"), "export const untracked = true;");
    await rm(join(root, "fixtures/Button.ts"));
    await symlink("../actual/Button.ts", join(root, "fixtures/Button.ts"));
    expect(await runCli(["validate", "--root", root])).toMatchObject({
      code: 2,
      stderr: expect.stringMatching(/symlink/i),
    });
    const other = await fixture();
    await writeFile(join(other, "actual-policy.yaml"), JSON.stringify(policy));
    await rm(join(other, "governance/policy.yaml"));
    await symlink("../actual-policy.yaml", join(other, "governance/policy.yaml"));
    expect(await runCli(["validate", "--root", other])).toMatchObject({
      code: 2,
      stderr: expect.stringMatching(/symlink/i),
    });
  });
  test("validate parses actual files and evaluation returns deterministic JSON", async () => {
    const root = await fixture();
    expect(await runCli(["validate", "--root", root])).toMatchObject({ code: 0 });
    const args = ["evaluate", "--demo", "--at", at, "--root", root, "--format", "json"];
    const one = await runCli(args);
    const two = await runCli(args);
    expect(one.code).toBe(0);
    expect(one.stdout).toBe(two.stdout);
    expect(JSON.parse(one.stdout)).toMatchObject({
      assurance: "demo",
      decisions: [{ gate: "ready" }],
    });
  });
  test("missing and failed mandatory evidence exit 1, malformed inputs exit 2", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "governance/evidence.json"),
      JSON.stringify([{ ...evidence, outcome: "failed" }]),
    );
    expect((await runCli(["evaluate", "--demo", "--root", root, "--at", at])).code).toBe(1);
    await writeFile(join(root, "governance/evidence.json"), "[]");
    expect((await runCli(["evaluate", "--demo", "--root", root, "--at", at])).code).toBe(1);
    await writeFile(join(root, "governance/components.yaml"), "schemaVersion: 9");
    expect(await runCli(["validate", "--root", root])).toMatchObject({ code: 2 });
  });
  test("missing evidence files are insufficient proof; missing registry is an input error", async () => {
    const root = await fixture();
    await rm(join(root, "governance/evidence.json"));
    expect((await runCli(["evaluate", "--demo", "--root", root, "--at", at])).code).toBe(1);
    await rm(join(root, "governance/components.yaml"));
    expect((await runCli(["validate", "--root", root])).code).toBe(2);
  });
  test("rejects duplicate flags, unknown options, invalid format and unknown component", async () => {
    const root = await fixture();
    for (const args of [
      ["evaluate", "--at", at, "--at", at],
      ["evaluate", "--wat"],
      ["evaluate", "--format", "html"],
    ])
      expect((await runCli(args)).code).toBe(2);
    expect(
      (
        await runCli([
          "evaluate",
          "--demo",
          "--root",
          root,
          "--at",
          at,
          "--component",
          "ui.missing",
        ])
      ).code,
    ).toBe(2);
  });
  test("source and configuration symlinks cannot escape the project root", async () => {
    const root = await fixture();
    await rm(join(root, "fixtures/Button.ts"));
    await symlink("/etc/passwd", join(root, "fixtures/Button.ts"));
    expect(await runCli(["validate", "--root", root])).toMatchObject({
      code: 2,
      stderr: expect.stringMatching(/outside|escape/i),
    });
    const other = await fixture();
    await rm(join(other, "governance/policy.yaml"));
    await symlink("/etc/passwd", join(other, "governance/policy.yaml"));
    expect(await runCli(["validate", "--root", other])).toMatchObject({
      code: 2,
      stderr: expect.stringMatching(/outside|escape/i),
    });
  });
  test("invalid dates and unverified mode cannot manufacture trusted approvals", async () => {
    const root = await fixture();
    expect(
      (await runCli(["evaluate", "--demo", "--root", root, "--at", "2026-02-30T00:00:00.000Z"]))
        .code,
    ).toBe(2);
    expect(await runCli(["evaluate", "--root", root, "--at", at])).toMatchObject({
      code: 2,
      stderr: expect.stringMatching(/git|commit/i),
    });
    expect(
      (await runCli(["evaluate", "--root", root, "--at", at, "--verifiedEvidenceDigests", "{}"]))
        .code,
    ).toBe(2);
  });
  test("normal mode rejects dirty source rather than attaching HEAD to changed files", async () => {
    const root = await fixture();
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
      "Fixture",
    ]);
    expect((await runCli(["evaluate", "--root", root, "--at", at])).code).toBe(1);
    await writeFile(join(root, "fixtures/Button.ts"), "export const modified = true;");
    expect(await runCli(["evaluate", "--root", root, "--at", at])).toMatchObject({
      code: 2,
      stderr: expect.stringMatching(/dirty|uncommitted/i),
    });
  });
});
