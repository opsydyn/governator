import { afterEach, expect, test } from "vitest";
import { rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { queryProject } from "./query-fixtures.ts";
import { runCli } from "../packages/cli/src/index.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
test("exports once to ignored artifacts and queries the identical report without source changes", async () => {
  const f = await queryProject();
  roots.push(f.root);
  const source = await readFile(join(f.root, "governance/components.yaml"), "utf8");
  const args = [
    "snapshot",
    "export",
    "--root",
    f.root,
    "--report",
    "artifacts/report.json",
    "--out",
    "artifacts/snapshot.json",
  ];
  const exported = await runCli(args);
  expect(exported.code, exported.stderr).toBe(0);
  expect(JSON.parse(exported.stdout)).toMatchObject({
    sourceCommit: f.commit,
    provenance: "simulated-snapshot",
  });
  const queried = await runCli([
    "query",
    "--root",
    f.root,
    "--snapshot",
    "artifacts/snapshot.json",
    "--tool",
    "get_design_system_report",
  ]);
  expect(queried.code, queried.stderr).toBe(0);
  expect(JSON.parse(queried.stdout).data).toEqual(f.report);
  expect((await runCli(args)).code).toBe(2);
  expect(
    (
      await runCli(
        args.map((x) => (x === "artifacts/snapshot.json" ? "governance/overwrite.json" : x)),
      )
    ).code,
  ).toBe(2);
  expect(await readFile(join(f.root, "governance/components.yaml"), "utf8")).toBe(source);
  expect(
    (
      await runCli([
        "query",
        "--root",
        f.root,
        "--snapshot",
        "artifacts/snapshot.json",
        "--tool",
        "get_component",
        "--args",
        '{"componentId":"ui.unknown"}',
      ])
    ).code,
  ).toBe(2);
});
