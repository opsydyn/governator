/* oxlint-disable linteffect/no-return-in-arrow, linteffect/no-naked-object-state-update -- Imperative filesystem fixtures and assertions. */
import { afterEach, expect, test } from "vitest";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadProject } from "../packages/cli/src/files.ts";
import { queryProject } from "./query-fixtures.ts";
import { component } from "./fixtures.ts";
import { runCli } from "../packages/cli/src/index.ts";
import { planRegistration, planMapping, applyPlan } from "../packages/operations/src/index.ts";
import { createSnapshot } from "../packages/query/src/index.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const f = await queryProject();
  roots.push(f.root);
  await writeFile(join(f.root, "package.json"), '{"type":"module"}');
  await writeFile(
    join(f.root, "governance/tests.json"),
    JSON.stringify({
      schemaVersion: 1,
      mappings: [{ componentId: "ui.button", files: ["tests/button.test.ts"] }],
    }),
  );
  await writeFile(join(f.root, "fixtures/Second.stories.ts"), "export default {};\n");
  await mkdir(join(f.root, "tests"));
  await writeFile(join(f.root, "tests/button.test.ts"), "export {};");
  await mkdir(join(f.root, "node_modules"));
  await mkdir(join(f.root, "node_modules/@opsydyn"));
  await symlink(
    resolve("packages/storybook-addon"),
    join(f.root, "node_modules/@opsydyn/storybook-addon-governator"),
  );
  return f;
}

test("registration plans are read-only, preserve replacement references and reject duplicate IDs", async () => {
  const f = await fixture();
  const path = "governance/components.yaml";
  const before = await readFile(join(f.root, path), "utf8");
  const fields = {
    ...component,
    id: "ui.old-button",
    lifecycle: "deprecated",
    stories: ["fixtures/Second.stories.ts"],
    replacementId: "ui.button",
  };
  const plan = await planRegistration(f.root, path, fields);
  expect(await readFile(join(f.root, path), "utf8")).toBe(before);
  await expect(applyPlan(f.root, plan, "0".repeat(64))).rejects.toThrow(/revision/i);
  await applyPlan(f.root, plan, plan.revision);
  expect((await loadProject(f.root)).registry.components[1]).toMatchObject(fields);
  await expect(planRegistration(f.root, path, fields)).rejects.toThrow(/already registered/);
});

test("registration rejects missing paths and mapping remains valid JSON with a stale-write guard", async () => {
  const f = await fixture();
  await expect(
    planRegistration(f.root, "governance/components.yaml", {
      ...component,
      id: "ui.missing",
      source: "missing.ts",
    }),
  ).rejects.toThrow();
  const plan = await planMapping(
    f.root,
    "governance/tests.json",
    "governance/components.yaml",
    "ui.button",
    ["tests/button.test.ts"],
  );
  await applyPlan(f.root, plan, plan.revision);
  const saved = await readFile(join(f.root, "governance/tests.json"), "utf8");
  expect(JSON.parse(saved).mappings).toEqual([
    { componentId: "ui.button", files: ["tests/button.test.ts"] },
  ]);
  await expect(applyPlan(f.root, plan, plan.revision)).rejects.toThrow(/revision/i);
  await expect(
    planMapping(f.root, "governance/tests.json", "governance/components.yaml", "ui.unknown", [
      "tests/button.test.ts",
    ]),
  ).rejects.toThrow();
  expect(await readFile(join(f.root, "governance/tests.json"), "utf8")).toBe(saved);
});

test("registration rejects symlinked files without touching the registry", async () => {
  const f = await fixture();
  await symlink(join(f.root, "fixtures/Button.ts"), join(f.root, "fixtures/alias.ts"));
  const before = await readFile(join(f.root, "governance/components.yaml"), "utf8");
  await expect(
    planRegistration(f.root, "governance/components.yaml", {
      ...component,
      id: "ui.alias",
      source: "fixtures/alias.ts",
    }),
  ).rejects.toThrow();
  expect(await readFile(join(f.root, "governance/components.yaml"), "utf8")).toBe(before);
});

test("CLI registration and mapping commands apply the reviewed revisions", async () => {
  const f = await fixture();
  await writeFile(
    join(f.root, "artifacts/new.json"),
    JSON.stringify({ ...component, id: "ui.second", stories: ["fixtures/Second.stories.ts"] }),
  );
  const planned = await runCli([
    "registry",
    "plan",
    "--root",
    f.root,
    "--fields",
    "artifacts/new.json",
  ]);
  expect(planned.code, planned.stderr).toBe(0);
  const applied = await runCli([
    "registry",
    "register",
    "--root",
    f.root,
    "--fields",
    "artifacts/new.json",
    "--revision",
    JSON.parse(planned.stdout).revision,
  ]);
  expect(applied.code, applied.stderr).toBe(0);
  await writeFile(join(f.root, "artifacts/files.json"), JSON.stringify(["tests/button.test.ts"]));
  const mapping = await runCli([
    "mapping",
    "plan",
    "--root",
    f.root,
    "--component",
    "ui.second",
    "--files",
    "artifacts/files.json",
  ]);
  expect(mapping.code, mapping.stderr).toBe(0);
  const updated = await runCli([
    "mapping",
    "update",
    "--root",
    f.root,
    "--component",
    "ui.second",
    "--files",
    "artifacts/files.json",
    "--revision",
    JSON.parse(mapping.stdout).revision,
  ]);
  expect(updated.code, updated.stderr).toBe(0);
});

test("tag adapter preview preserves source, applies once, and rejects reserved tags", async () => {
  const f = await fixture();
  const story = "./fixtures/Button.stories.ts";
  const source =
    "export default { title: 'Button', tags: ['autodocs', 'old'] };\nexport const Primary = {};\n";
  await writeFile(join(f.root, story), source);
  await writeFile(join(f.root, "artifacts/tags.json"), '["new"]');
  const args = ["--root", f.root, "--story-path", story];
  const planned = await runCli(["tags", "plan", ...args, "--tags", "artifacts/tags.json"]);
  expect(planned.code, planned.stderr).toBe(0);
  expect(await readFile(join(f.root, story), "utf8")).toBe(source);
  const update = [
    "tags",
    "update",
    ...args,
    "--tags",
    "artifacts/tags.json",
    "--revision",
    JSON.parse(planned.stdout).revision,
  ];
  expect((await runCli(update)).code).toBe(0);
  expect((await runCli(update)).code).toBe(2);
  const saved = await readFile(join(f.root, story), "utf8");
  expect(saved).toContain("autodocs");
  const inspected = await runCli(["tags", "inspect", ...args]);
  expect(JSON.parse(inspected.stdout).tags).toEqual(["new"]);
  await writeFile(join(f.root, "artifacts/tags.json"), '["test"]');
  expect((await runCli(["tags", "plan", ...args, "--tags", "artifacts/tags.json"])).code).toBe(2);
  expect(await readFile(join(f.root, story), "utf8")).toBe(saved);
});

test("doctor detects dirty source, unassessed dependencies and stale report without changing inputs", async () => {
  const f = await fixture();
  await writeFile(
    join(f.root, "artifacts/stale.json"),
    JSON.stringify({ ...f.report, evaluatedAt: "2020-01-01T00:00:00.000Z" }),
  );
  const before = await readFile(join(f.root, "governance/components.yaml"), "utf8");
  const result = await runCli([
    "doctor",
    "--root",
    f.root,
    "--format",
    "json",
    "--report",
    "artifacts/stale.json",
  ]);
  expect(result.code, result.stderr).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report).toMatchObject({ sourceCommit: f.commit, evidenceProduced: false });
  expect(report.findings.find((item: { id: string }) => item.id === "source").status).toBe(
    "attention",
  );
  expect(report.findings.find((item: { id: string }) => item.id === "report").status).toBe(
    "attention",
  );
  expect(await readFile(join(f.root, "governance/components.yaml"), "utf8")).toBe(before);
});

test("doctor loads a fresh snapshot and reports source changes as attention", async () => {
  const f = await queryProject();
  roots.push(f.root);
  const snapshot = await createSnapshot(f.root, { report: "artifacts/report.json" });
  await writeFile(join(f.root, "artifacts/snapshot.json"), JSON.stringify(snapshot));
  const args = [
    "doctor",
    "--root",
    f.root,
    "--format",
    "json",
    "--snapshot",
    "artifacts/snapshot.json",
  ];
  const initial = JSON.parse((await runCli(args)).stdout);
  expect(initial.findings.find((item: { id: string }) => item.id === "snapshot").status).toBe("ok");
  await writeFile(join(f.root, "fixtures/Button.ts"), "export const changed = true;");
  const changed = JSON.parse((await runCli(args)).stdout);
  expect(changed.findings.find((item: { id: string }) => item.id === "snapshot").status).toBe(
    "attention",
  );
});
