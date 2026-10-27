import parseChangeset from "@changesets/parse";
import semver from "semver";
import { decode, digest, ensure, unique, validTimestamp } from "@governanator/core";
import { diffApi } from "./api.ts";
import { assessVersion } from "./versions.ts";
import { ReleaseArtifact, ChangeRecord, SimulatedReview } from "./release-schema.ts";
export * from "./release-schema.ts";
export function parseIntent(contents: string): {
  summary: string;
  releases: readonly { name: string; type: "none" | "patch" | "minor" | "major" }[];
} {
  ensure(contents.trimStart().startsWith("---"), "Changeset must start with YAML frontmatter");
  const parsed = parseChangeset(contents);
  ensure(parsed.summary.trim().length > 0, "Changeset summary must not be empty");
  return parsed;
}
interface ReleaseInput {
  readonly baseline: unknown;
  readonly candidate: unknown;
  readonly consumerDiagnostics: readonly string[];
  readonly intents: readonly { readonly id: string; readonly contents: string }[];
  readonly classification: unknown;
  readonly mode: "local" | "demo";
  readonly commit: string;
  readonly at: string;
  readonly inputDigest: string;
  readonly review?: unknown;
  readonly documents: Readonly<Record<string, string>>;
  // Only the host's fresh in-process runner supplies this. Saved receipt JSON is never accepted by CLI.
  readonly localReport: {
    readonly commit: string;
    readonly evaluatedAt: string;
    readonly decisions: readonly { readonly componentId: string; readonly gate: string }[];
  };
}
const ranks = { none: 0, patch: 1, minor: 2, major: 3 };
function maximum(kinds: readonly (keyof typeof ranks)[]) {
  return kinds.reduce((a, b) => (ranks[a] >= ranks[b] ? a : b), "none" as keyof typeof ranks);
}
export function assessRelease(input: ReleaseInput) {
  const baseline = decode(ReleaseArtifact, input.baseline),
    candidate = decode(ReleaseArtifact, input.candidate);
  ensure(baseline.manifest.name === candidate.manifest.name, "Release packages differ");
  for (const artifact of [baseline, candidate])
    ensure(
      artifact.api.packageId === artifact.manifest.name &&
        artifact.api.packageVersion === artifact.manifest.version,
      "Artifact API and package identity/version mismatch",
    );
  validTimestamp(input.at);
  const diff = diffApi(baseline.api, candidate.api, digest(baseline.api));
  const changedFiles = [
    ...new Set([...Object.keys(baseline.files), ...Object.keys(candidate.files)]),
  ]
    .filter((path) => baseline.files[path] !== candidate.files[path])
    .sort();
  const surfaceChanged =
    digest({
      type: baseline.manifest.type,
      exports: baseline.manifest.exports,
      peers: baseline.manifest.peerDependencies,
      dependencies: baseline.manifest.dependencies,
    }) !==
    digest({
      type: candidate.manifest.type,
      exports: candidate.manifest.exports,
      peers: candidate.manifest.peerDependencies,
      dependencies: candidate.manifest.dependencies,
    });
  const contractChanged = digest(baseline.api.components) !== digest(candidate.api.components);
  const distributedChange = changedFiles.length > 0 || surfaceChanged || contractChanged;
  const blocks: string[] = [],
    missing: string[] = [];
  if (input.consumerDiagnostics.length)
    blocks.push(...input.consumerDiagnostics.map((d) => "Consumer compile failed: " + d));
  const intents = input.intents.map((item) => ({ id: item.id, ...parseIntent(item.contents) }));
  unique(
    intents.map((i) => i.id),
    "Changeset ID",
  );
  const declarations = intents
    .flatMap((i) => i.releases)
    .filter((release) => release.name === candidate.manifest.name);
  const declaredBump = maximum(declarations.map((item) => item.type));
  if (distributedChange && (!declarations.length || declaredBump === "none"))
    blocks.push("Changed distributed artifacts require a Changeset release declaration");
  const expectedVersion =
    declaredBump === "none"
      ? baseline.manifest.version
      : semver.inc(baseline.manifest.version, declaredBump);
  if (candidate.manifest.version !== expectedVersion)
    blocks.push(
      `Changesets require candidate package version ${expectedVersion}; found ${candidate.manifest.version}`,
    );
  const record = input.classification === null ? null : decode(ChangeRecord, input.classification);
  if (distributedChange && !record)
    missing.push("Reasoned change classification and affected components are required");
  if (record) {
    unique(
      record.components.map((c) => c.componentId),
      "classified component",
    );
    for (const item of record.components)
      ensure(
        candidate.api.components.some((c) => c.componentId === item.componentId) ||
          baseline.api.components.some((c) => c.componentId === item.componentId),
        `Unknown classified component ${item.componentId}`,
      );
    if (ranks[record.kind] < ranks[maximum(record.components.map((c) => c.kind))])
      blocks.push("Package classification is below its highest component classification");
  }
  const detectedMinimum = maximum(
    diff.changes.filter((c) => c.bump !== "unknown").map((c) => c.bump as "major" | "minor"),
  );
  if (record && ranks[record.kind] < ranks[detectedMinimum])
    blocks.push(`Declared classification ${record.kind} is below detected ${detectedMinimum}`);
  for (const change of diff.changes)
    if (
      change.componentId &&
      change.bump !== "unknown" &&
      record?.components.some(
        (c) =>
          c.componentId === change.componentId &&
          ranks[c.kind] < ranks[change.bump as "major" | "minor"],
      )
    )
      blocks.push(
        `${change.componentId}: component classification is below detected ${change.bump}`,
      );
  const minimumBump = maximum([
    detectedMinimum,
    distributedChange ? "patch" : "none",
    record?.kind ?? "none",
    surfaceChanged ? "major" : "none",
  ]);
  if (distributedChange && ranks[declaredBump] < ranks[minimumBump])
    blocks.push(`Changeset requires at least ${minimumBump}; declared ${declaredBump}`);
  const affectedIds = [
    ...new Set([
      ...diff.changes.flatMap((c) =>
        c.componentId ? [c.componentId] : baseline.api.components.map((c) => c.componentId),
      ),
      ...(record?.components.map((c) => c.componentId) ?? []),
    ]),
  ].sort();
  for (const id of affectedIds)
    if (!record?.components.some((c) => c.componentId === id))
      missing.push(`Missing owner classification for ${id}`);
  let reviewed = false;
  if (distributedChange) {
    if (input.mode !== "demo")
      missing.push(
        "Trusted owner review integration unavailable; simulated or self asserted reviews cannot authorize a normal release",
      );
    else if (!input.review)
      missing.push("Exact candidate simulated owner review is required in demo mode");
    else {
      const review = decode(SimulatedReview, input.review);
      validTimestamp(review.observedAt);
      validTimestamp(review.expiresAt);
      const now = Date.parse(input.at),
        observed = Date.parse(review.observedAt),
        expires = Date.parse(review.expiresAt);
      reviewed =
        review.commit === input.commit &&
        review.artifactDigest === candidate.artifactDigest &&
        review.inputDigest === input.inputDigest &&
        observed <= now &&
        now - observed <= 86_400_000 &&
        expires > now &&
        expires > observed &&
        expires - observed <= 86_400_000 &&
        review.roles.includes("design-system-owner") &&
        (minimumBump !== "major" || review.roles.includes("api-owner"));
      if (!reviewed)
        missing.push(
          "Simulated review scope, required roles or freshness does not match the exact source, artifact and inputs",
        );
    }
    if (record)
      for (const [kind, path] of Object.entries(record.documents))
        if ((input.documents[path]?.trim().length ?? 0) < 16)
          missing.push(`Missing substantive ${kind}: ${path}`);
    if (
      input.localReport.commit !== input.commit ||
      !Number.isFinite(Date.parse(input.localReport.evaluatedAt)) ||
      Date.parse(input.localReport.evaluatedAt) > Date.parse(input.at) ||
      Date.parse(input.at) - Date.parse(input.localReport.evaluatedAt) > 86_400_000
    )
      missing.push("Local test evidence is stale or belongs to another source");
    for (const id of affectedIds)
      if (!input.localReport.decisions.some((c) => c.componentId === id && c.gate === "ready"))
        missing.push(`Current local readiness evidence is required for ${id}`);
  }
  const packageDecision = assessVersion({
    previous: baseline.manifest.version,
    proposed: candidate.manifest.version,
    minimum: minimumBump,
    classified: !diff.requiresReview || reviewed,
    majorRequirementsVerified: reviewed && missing.length === 0,
  });
  blocks.push(
    ...packageDecision.reasons.filter(
      (reason) =>
        !reason.startsWith("Major requires") && !reason.startsWith("Compatibility is unknown"),
    ),
  );
  for (const id of affectedIds) {
    const old = baseline.api.components.find((c) => c.componentId === id),
      next = candidate.api.components.find((c) => c.componentId === id);
    if (!next || !next.present) {
      blocks.push(
        `Removed component ${id} requires deprecation-window verification, which is unavailable`,
      );
      continue;
    }
    const changes = diff.changes.filter((c) => c.componentId === id);
    const minimum = maximum([
      record?.components.find((c) => c.componentId === id)?.kind ?? "none",
      ...changes.filter((c) => c.bump !== "unknown").map((c) => c.bump as "major" | "minor"),
    ]);
    const decision = assessVersion({
      previous: old?.contractVersion ?? "1.0.0",
      proposed: next.contractVersion,
      minimum,
      classified: !changes.some((c) => c.bump === "unknown") || reviewed,
      majorRequirementsVerified: reviewed && missing.length === 0,
    });
    blocks.push(
      ...decision.reasons
        .filter(
          (reason) =>
            !reason.startsWith("Major requires") && !reason.startsWith("Compatibility is unknown"),
        )
        .map((reason) => `${id}: ${reason}`),
    );
  }
  const reasons = [...new Set([...blocks, ...missing])];
  const gate = blocks.length ? "blocked" : missing.length ? "insufficient_evidence" : "ready";
  return {
    schemaVersion: 1 as const,
    packageId: candidate.manifest.name,
    baselineVersion: baseline.manifest.version,
    candidateVersion: candidate.manifest.version,
    baselineDigest: baseline.artifactDigest,
    candidateDigest: candidate.artifactDigest,
    sourceCommit: input.commit,
    evaluatedAt: input.at,
    inputDigest: input.inputDigest,
    gate,
    status:
      gate === "ready"
        ? input.mode === "demo"
          ? "eligible_under_demo_policy"
          : "eligible_under_local_policy"
        : "not_eligible",
    assurance: input.mode === "demo" ? "simulated" : "unverified",
    publishable: false as const,
    publication: "unknown" as const,
    deployment: "unknown" as const,
    adoption: "unknown" as const,
    distributedChange,
    changedFiles,
    detectedChanges: diff.changes,
    minimumBump,
    declaredBump,
    affectedComponents: affectedIds,
    reasons,
    remediation: gate === "ready" ? ["Local eligibility does not authorize publication"] : reasons,
    policyVersion: "local-release-v1",
  };
}
