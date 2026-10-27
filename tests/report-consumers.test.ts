import { afterEach, expect, test } from "vitest";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluate, digest } from "../packages/core/src/index.ts";
import { runCli } from "../packages/cli/src/index.ts";
import { createSnapshot, loadSnapshot } from "../packages/query/src/snapshot.ts";
import { createQueryService } from "../packages/query/src/service.ts";
import { queryProject } from "./query-fixtures.ts";
import { registry, policy, evidence } from "./fixtures.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(version: 1 | 2) {
  const f = await queryProject();
  roots.push(f.root);
  const report = evaluate(
    {
      registry,
      policy,
      evidence: [
        {
          ...evidence,
          commit: f.commit,
          repository: "local:fixture",
          observedAt: f.at,
          expiresAt: new Date(f.now + 3600000).toISOString(),
        },
      ],
      waivers: [],
      target: "stable",
      at: f.at,
      commit: f.commit,
      repository: "local:fixture",
      mode: "demo",
      verifiedEvidenceDigests: {},
      verifiedWaiverDigests: {},
    },
    version,
  );
  await writeFile(join(f.root, "artifacts/report.json"), JSON.stringify(report));
  return { ...f, report };
}
test.each([1, 2] as const)("CLI selects schema %i and preserves gates", async (version) => {
  const f = await fixture(version);
  // Use project evidence as evaluated by the CLI, including its honest expired state.
  const args = ["evaluate", "--demo", "--root", f.root, "--at", f.at, "--format", "json"];
  const original = await runCli(args);
  expect(JSON.parse(original.stdout).schemaVersion).toBe(1);
  const selected = await runCli([...args, "--report-schema", String(version)]);
  expect(selected.code).toBe(original.code);
  const report = JSON.parse(selected.stdout);
  expect(report.schemaVersion).toBe(version);
  expect(report.decisions.map((d: { gate: string }) => d.gate)).toEqual(
    JSON.parse(original.stdout).decisions.map((d: { gate: string }) => d.gate),
  );
  if (version === 2) expect(report.decisions[0].checks[0].evidence).toBeDefined();
});
test("CLI rejects unsupported, missing and duplicate report versions", async () => {
  for (const args of [
    ["--report-schema", "3"],
    ["--report-schema", "02"],
    ["--report-schema"],
    ["--report-schema", "2", "--report-schema", "1"],
  ]) {
    for (const command of ["evaluate", "check"])
      expect((await runCli([command, ...args])).code).toBe(2);
  }
});
test.each([1, 2] as const)(
  "snapshot and recorded query preserve schema %i; pure evaluation keeps version and scope",
  async (version) => {
    const f = await fixture(version);
    const exported = await runCli([
      "snapshot",
      "export",
      "--root",
      f.root,
      "--report",
      "artifacts/report.json",
      "--out",
      "artifacts/snapshot.json",
    ]);
    expect(exported.code).toBe(0);
    const saved = JSON.parse(await readFile(join(f.root, "artifacts/snapshot.json"), "utf8"));
    expect(saved.payload.report).toEqual(f.report);
    const loaded = await loadSnapshot(f.root, "artifacts/snapshot.json", f.now);
    const service = createQueryService(loaded);
    expect(service.query("get_design_system_report", {}, f.now)).toMatchObject({
      scope: "recorded-snapshot",
      data: f.report,
    });
    const fresh = service.query(
      "evaluate_component",
      { componentId: "ui.button", targetLifecycle: "stable" },
      f.now,
    );
    expect(fresh.scope).toBe("pure-unverified-evaluation");
    expect(fresh.data).toMatchObject({ gate: "insufficient_evidence" });
    if (version === 2) {
      expect(fresh.data).toMatchObject({
        checks: [expect.objectContaining({ evidence: expect.any(Array) })],
      });
      expect(fresh.limitations.join(" ")).toMatch(/metadata parity/i);
    }
  },
);
test("snapshot rejects semantically invalid v2 reports, including recomputed snapshot digests", async () => {
  const f = await fixture(2);
  const valid = await createSnapshot(f.root, { report: "artifacts/report.json" }, f.now);
  const report = JSON.parse(JSON.stringify(f.report));
  if (report.schemaVersion !== 2) throw new Error("Expected v2");
  report.decisions[0]!.checks[0]!.evidence[0]!.observedAt = new Date(f.now + 1000).toISOString();
  await writeFile(join(f.root, "artifacts/report.json"), JSON.stringify(report));
  await expect(
    createSnapshot(f.root, { report: "artifacts/report.json" }, f.now),
  ).rejects.toThrow();
  const { digest: _digest, ...body } = valid;
  const changed = { ...body, payload: { ...body.payload, report } };
  await writeFile(
    join(f.root, "artifacts/snapshot.json"),
    JSON.stringify({ ...changed, digest: digest(changed) }),
  );
  await expect(loadSnapshot(f.root, "artifacts/snapshot.json", f.now)).rejects.toThrow();
});
