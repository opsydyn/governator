import { afterEach, expect, test } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../packages/cli/src/index.ts";
import { digest } from "../packages/core/src/digest.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
test("CLI snapshots emitted declarations and blocks an incompatible patch against its exact baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "governanator-api-"));
  roots.push(root);
  const config = {
    packageId: "@example/ui",
    packageVersion: "8.4.1",
    components: [
      {
        componentId: "ui.button",
        exportName: "Button",
        propsExport: "ButtonProps",
        contractVersion: "1.2.0",
      },
    ],
  };
  await writeFile(join(root, "config.json"), JSON.stringify(config));
  await writeFile(
    join(root, "index.d.ts"),
    "export interface ButtonProps {label:string; disabled?:boolean} export declare function Button(props:ButtonProps):string;",
  );
  const before = await runCli([
    "contracts",
    "snapshot",
    "--root",
    root,
    "--config",
    "config.json",
    "--declarations",
    "index.d.ts",
  ]);
  expect(before.code, before.stderr).toBe(0);
  const baseline = JSON.parse(before.stdout);
  await writeFile(join(root, "baseline.json"), before.stdout);
  await writeFile(join(root, "baseline.sha256"), digest(baseline));
  await writeFile(
    join(root, "config.json"),
    JSON.stringify({
      ...config,
      packageVersion: "8.4.2",
      components: [{ ...config.components[0], contractVersion: "1.2.1" }],
    }),
  );
  await writeFile(
    join(root, "index.d.ts"),
    "export interface ButtonProps {label:string} export declare function Button(props:ButtonProps):string;",
  );
  const after = await runCli([
    "contracts",
    "snapshot",
    "--root",
    root,
    "--config",
    "config.json",
    "--declarations",
    "index.d.ts",
  ]);
  expect(after.code, after.stderr).toBe(0);
  await writeFile(join(root, "candidate.json"), after.stdout);
  const result = await runCli([
    "contracts",
    "diff",
    "--root",
    root,
    "--baseline",
    "baseline.json",
    "--candidate",
    "candidate.json",
    "--baseline-digest",
    "baseline.sha256",
  ]);
  expect(result.code, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ minimumBump: "major", gate: "blocked" });
  expect(
    (await runCli(["contracts", "diff", "--root", root, "--baseline", "../outside.json"])).code,
  ).toBe(2);
});
