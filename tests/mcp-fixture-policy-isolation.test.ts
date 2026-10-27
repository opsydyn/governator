import { afterEach, expect, test } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { captureCandidate, checkCandidate } from "../packages/cli/src/release.ts";
import { releaseSummary } from "../packages/cli/src/release-summary.ts";
import { runCli } from "../packages/cli/src/index.ts";
import { createQueryService, createSnapshot, loadSnapshot } from "../packages/query/src/index.ts";
import { createMcpServer } from "../packages/mcp/src/server.ts";
import { applyFixturePolicyTransition } from "../packages/fixture-policy/src/index.ts";
import { fixturePolicy } from "./fixture-policy-fixtures.ts";
import { releaseProject } from "./release-fixtures.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("a committed synthetic policy lifecycle cannot authorize a real candidate or saved MCP report", async () => {
  const root = await releaseProject();
  roots.push(root);
  const config = "governance/release.json";
  const { candidate, path } = await captureCandidate(root, config, "artifacts/candidate");
  const fixture = fixturePolicy();
  const boot = applyFixturePolicyTransition(fixture.bootstrap());
  expect(boot).toMatchObject({ assurance: "fixture-only", status: "committed", reasons: [] });
  expect(boot.store?.version).toBe(1);
  const enrollment = applyFixturePolicyTransition(fixture.enrollment(boot.store));
  expect(enrollment).toMatchObject({ assurance: "fixture-only", status: "committed", reasons: [] });
  expect(enrollment.store?.version).toBe(2);
  expect(enrollment.store?.consumedChallenges).toHaveLength(1);

  // Persist the real result alongside fabricated authority claims at the configured review input.
  await writeFile(
    join(root, "artifacts/review.json"),
    JSON.stringify({
      ...enrollment,
      verified: true,
      authenticated: true,
      approved: true,
      commit: candidate.commit,
      artifactDigest: candidate.artifact.artifactDigest,
      inputDigest: candidate.inputDigest,
      roles: ["design-system-owner", "api-owner"],
    }),
  );
  const checked = await checkCandidate(root, config, path);
  expect(checked).toMatchObject({
    gate: "insufficient_evidence",
    status: "not_eligible",
    assurance: "unverified",
    publishable: false,
    publication: "unknown",
    deployment: "unknown",
    adoption: "unknown",
  });
  expect(checked.reasons).toContain(
    "Trusted owner review integration unavailable; simulated or self asserted reviews cannot authorize a normal release",
  );

  const evaluated = await runCli(["evaluate", "--root", root, "--format", "json"]);
  expect(evaluated.code).toBe(1);
  await writeFile(
    join(root, "artifacts/report.json"),
    JSON.stringify({ ...JSON.parse(evaluated.stdout), release: releaseSummary(checked) }),
  );
  await writeFile(
    join(root, "artifacts/release.json"),
    JSON.stringify({
      ...checked,
      verified: true,
      authenticated: true,
      approved: true,
      fixturePolicy: enrollment,
    }),
  );
  await expect(
    createSnapshot(root, {
      report: "artifacts/report.json",
      release: "artifacts/release.json",
      config,
    }),
  ).rejects.toThrow(/excess property/);
  await writeFile(join(root, "artifacts/release.json"), JSON.stringify(checked));
  const saved = await createSnapshot(root, {
    report: "artifacts/report.json",
    release: "artifacts/release.json",
    config,
  });
  await writeFile(join(root, "artifacts/snapshot.json"), JSON.stringify(saved));
  const service = createQueryService(await loadSnapshot(root, "artifacts/snapshot.json"));
  const args = { packageId: "@test/ui", candidateVersion: "1.0.1" };
  const recorded = service.query("explain_release_block", args);
  expect(recorded).toMatchObject({
    scope: "recorded-snapshot",
    provenance: "unverified-snapshot",
    data: { gate: "insufficient_evidence", assurance: "unverified", publishable: false },
  });
  expect(recorded.data).toEqual(checked);
  expect(recorded.limitations).toContain(
    "Recorded decisions and receipts are unverified snapshot data, not fresh attestations",
  );
  const server = createMcpServer(service);
  const client = new Client({ name: "fixture-policy-isolation-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      [
        "list_components",
        "get_component",
        "get_component_evidence",
        "evaluate_component",
        "explain_governance_failure",
        "get_design_system_report",
        "list_approved_components",
        "get_component_contract",
        "diff_component_contract",
        "list_breaking_changes",
        "explain_release_block",
        "get_release_manifest",
        "get_consumer_compatibility",
        "plan_component_migration",
      ].sort(),
    );
    const result = await client.callTool({ name: "explain_release_block", arguments: args });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual(recorded);
  } finally {
    await client.close();
    await server.close();
  }

  // The release checker must independently rehash actual candidate bytes.
  await writeFile(join(root, "artifacts/candidate", candidate.tarball), "changed artifact");
  await expect(checkCandidate(root, config, path)).rejects.toThrow(
    "Candidate artifact digest changed after capture",
  );
}, 30000);
