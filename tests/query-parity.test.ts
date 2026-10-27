import { afterEach, expect, test, vi } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { captureCandidate, checkCandidate } from "../packages/cli/src/release.ts";
import { releaseSummary } from "../packages/cli/src/release-summary.ts";
import {
  createSnapshot,
  loadSnapshot,
  createQueryService,
  toolNames,
} from "../packages/query/src/index.ts";
import { assertSafeApi } from "../packages/query/src/api-safety.ts";
import { releaseProject, review } from "./release-fixtures.ts";
import { runCli } from "../packages/cli/src/index.ts";
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
test("all fourteen tools preserve exact release, report and consumer scope without producer activity", async () => {
  const root = await releaseProject();
  roots.push(root);
  const candidate = await captureCandidate(root, "governance/release.json", "artifacts/candidate");
  await review(root);
  const release = await checkCandidate(root, "governance/release.json", candidate.path, true);
  const evaluated = await runCli(["evaluate", "--root", root, "--format", "json"]);
  expect(evaluated.code).toBe(1);
  const report = { ...JSON.parse(evaluated.stdout), release: releaseSummary(release) };
  await writeFile(join(root, "artifacts/report.json"), JSON.stringify(report));
  await writeFile(join(root, "artifacts/release.json"), JSON.stringify(release));
  const snapshot = await createSnapshot(root, {
    report: "artifacts/report.json",
    release: "artifacts/release.json",
    config: "governance/release.json",
  });
  await writeFile(join(root, "artifacts/snapshot.json"), JSON.stringify(snapshot));
  const service = createQueryService(await loadSnapshot(root, "artifacts/snapshot.json"));
  const cli = await runCli([
    "query",
    "--root",
    root,
    "--snapshot",
    "artifacts/snapshot.json",
    "--tool",
    "get_design_system_report",
  ]);
  expect(cli.code, cli.stderr).toBe(0);
  expect(JSON.parse(cli.stdout).data).toEqual(report);
  const baselineStatus = execFileSync("git", ["-C", root, "status", "--porcelain"], {
    encoding: "utf8",
  });
  const spawn = vi.spyOn(Bun, "spawn").mockImplementation(() => {
    throw new Error("query spawned process");
  });
  const spawnSync = vi.spyOn(Bun, "spawnSync").mockImplementation(() => {
    throw new Error("query spawned process");
  });
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("query used network");
  });
  const base = { componentId: "ui.button" },
    pkg = { packageId: "@test/ui", candidateVersion: "1.0.1" };
  const requests: Record<string, Record<string, unknown>> = {
    list_components: {},
    get_component: base,
    get_component_evidence: base,
    evaluate_component: { ...base, targetLifecycle: "stable" },
    explain_governance_failure: { ...base, targetLifecycle: "stable" },
    get_design_system_report: {},
    list_approved_components: {},
    get_component_contract: base,
    diff_component_contract: { ...base, fromVersion: "1.0.0", toVersionOrCandidate: "candidate" },
    list_breaking_changes: {},
    explain_release_block: pkg,
    get_release_manifest: { packageId: "@test/ui", version: "1.0.1" },
    get_consumer_compatibility: pkg,
    plan_component_migration: { ...base, fromVersion: "1.0.0", toVersion: "1.0.1" },
  };
  const results = Object.fromEntries(
    toolNames.map((name) => [name, service.query(name, requests[name]).data]),
  );
  expect(results.get_design_system_report).toEqual(report);
  expect(results.explain_release_block).toEqual(release);
  expect(results.evaluate_component).toEqual(results.explain_governance_failure);
  expect(results.evaluate_component).toMatchObject({ gate: "insufficient_evidence" });
  expect(results.list_approved_components).toMatchObject({ approvalVerified: false });
  expect(results.get_component_contract).toMatchObject({
    status: "available",
    contract: { contractVersion: "1.0.1" },
  });
  expect(results.diff_component_contract).toMatchObject({
    status: "available",
    minimumBump: "none",
  });
  expect(results.get_release_manifest).toMatchObject({
    artifactDigest: release.candidateDigest,
    publication: "unknown",
  });
  expect(results.get_consumer_compatibility).toMatchObject({
    recordedCompile: { result: "passed", artifactDigest: release.candidateDigest },
    adoption: "unknown",
  });
  expect(results.plan_component_migration).toMatchObject({
    status: "available",
    documents: expect.arrayContaining([
      { path: "governance/migration.md", content: expect.any(String) },
    ]),
    editsPerformed: false,
  });
  expect(
    service.query("get_component_contract", { ...base, contractVersion: "99.0.0" }).data,
  ).toMatchObject({ status: "unavailable" });
  expect(service.query("list_breaking_changes", { sinceVersion: "99.0.0" }).data).toMatchObject({
    status: "unavailable",
  });
  expect(
    service.query("plan_component_migration", {
      ...base,
      fromVersion: "99.0.0",
      toVersion: "1.0.1",
    }).data,
  ).toMatchObject({ status: "unavailable", suggestions: [] });
  expect(spawn).not.toHaveBeenCalled();
  expect(spawnSync).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  expect(execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" })).toBe(
    baselineStatus,
  );
}, 30000);
test("compiler input rejects local file imports and reference directives", () => {
  for (const declaration of [
    'import type {Secret} from "../../secrets";',
    '/// <reference path="/etc/passwd" />',
    'type X=import("/tmp/private").X;',
  ])
    expect(() => assertSafeApi(declaration)).toThrow(/import|reference/i);
});
