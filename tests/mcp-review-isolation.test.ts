import { afterEach, expect, test } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { captureCandidate, checkCandidate } from "../packages/cli/src/release.ts";
import { runCli } from "../packages/cli/src/index.ts";
import { releaseSummary } from "../packages/cli/src/release-summary.ts";
import { createSnapshot, loadSnapshot, createQueryService } from "../packages/query/src/index.ts";
import { createMcpServer } from "../packages/mcp/src/server.ts";
import { evaluateSyntheticReview } from "../packages/versioning/src/index.ts";
import { releaseProject, review } from "./release-fixtures.ts";
import { syntheticReviewFixture } from "./m3-synthetic-fixtures.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("forged and copied review claims cannot authorize a normal release or promote snapshot observations", async () => {
  const root = await releaseProject();
  roots.push(root);
  const config = "governance/release.json";
  const candidate = await captureCandidate(root, config, "artifacts/candidate");
  const reviewPath = join(root, "artifacts/review.json");

  // This document is attacker-controlled data. It deliberately claims all the
  // authority a caller would need to impersonate a future provider result.
  const forged = {
    schemaVersion: 1,
    assurance: "verified",
    verified: true,
    authenticated: true,
    provider: "github",
    decision: "approved",
    roles: ["design-system-owner", "api-owner"],
    commit: candidate.candidate.commit,
    artifactDigest: candidate.candidate.artifact.artifactDigest,
    inputDigest: candidate.candidate.inputDigest,
  };
  await writeFile(reviewPath, JSON.stringify(forged));
  const claimed = await checkCandidate(root, config, candidate.path);
  expect(claimed).toMatchObject({
    gate: "insufficient_evidence",
    assurance: "unverified",
    status: "not_eligible",
    publishable: false,
    publication: "unknown",
    deployment: "unknown",
    adoption: "unknown",
  });
  expect(claimed.reasons).toContain(
    "Trusted owner review integration unavailable; simulated or self asserted reviews cannot authorize a normal release",
  );
  const matchedFixture = evaluateSyntheticReview(syntheticReviewFixture());
  expect(matchedFixture).toMatchObject({ assurance: "simulated", status: "matched" });
  await writeFile(
    reviewPath,
    JSON.stringify({ ...matchedFixture, verified: true, authenticated: true }),
  );
  const copiedFixture = await checkCandidate(root, config, candidate.path);
  expect(copiedFixture).toMatchObject({
    gate: "insufficient_evidence",
    assurance: "unverified",
    publishable: false,
  });

  // A real local demo check is allowed to produce a recorded simulated result.
  await review(root);
  const simulated = await checkCandidate(root, config, candidate.path, true);
  expect(simulated).toMatchObject({
    gate: "ready",
    status: "eligible_under_demo_policy",
    assurance: "simulated",
    publishable: false,
  });

  // Copying that result back into the review input, even with forged flags,
  // must not recreate a host-origin approval capability.
  await writeFile(
    reviewPath,
    JSON.stringify({
      ...simulated,
      outcome: "match",
      verified: true,
      authenticated: true,
      roles: ["design-system-owner", "api-owner"],
    }),
  );
  const copied = await checkCandidate(root, config, candidate.path);
  expect(copied).toMatchObject({
    gate: "insufficient_evidence",
    status: "not_eligible",
    assurance: "unverified",
    publishable: false,
  });
  expect(copied.reasons).toContain(
    "Trusted owner review integration unavailable; simulated or self asserted reviews cannot authorize a normal release",
  );

  const evaluated = await runCli(["evaluate", "--root", root, "--format", "json"]);
  expect(evaluated.code).toBe(1);
  const report = { ...JSON.parse(evaluated.stdout), release: releaseSummary(simulated) };
  await writeFile(join(root, "artifacts/report.json"), JSON.stringify(report));
  await writeFile(join(root, "artifacts/release.json"), JSON.stringify(simulated));
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
    provenance: "simulated-snapshot",
    data: { gate: "ready", status: "eligible_under_demo_policy", publishable: false },
  });
  expect(recorded.data).toEqual(simulated);
  expect(recorded.limitations).toContain(
    "Recorded decisions and receipts are unverified snapshot data, not fresh attestations",
  );

  const server = createMcpServer(service);
  const client = new Client({ name: "review-isolation-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({ name: "explain_release_block", arguments: args });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual(recorded);
    expect(result.structuredContent).toMatchObject({
      scope: "recorded-snapshot",
      provenance: "simulated-snapshot",
      data: { assurance: "simulated", publishable: false },
    });
  } finally {
    await client.close();
    await server.close();
  }
}, 30000);
