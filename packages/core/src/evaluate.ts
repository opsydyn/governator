import {
  decode,
  ensure,
  decodeRegistry,
  decodePolicy,
  decodeEvidence,
  Evaluation,
  unique,
  validTimestamp,
} from "./domain.ts";
import type { Component, Evidence, Policy, Waiver, CheckResult, Decision } from "./domain.ts";
import type {
  GovernanceReport,
  GovernanceReportV1,
  GovernanceReportV2,
} from "@governator/protocol";
import { canonicalJson, digest } from "./digest.ts";

function trusted(item: Evidence | Waiver, input: Evaluation, kind: "evidence" | "waiver"): boolean {
  if (input.mode === "demo") return item.provenance === "demo";
  const attestations =
    kind === "evidence" ? input.verifiedEvidenceDigests : input.verifiedWaiverDigests;
  return item.provenance === "adapter" && attestations[item.id] === digest(item);
}
function evaluateCheck(
  component: Component,
  rule: NonNullable<Policy["requirements"]["stable"]>["checks"][number],
  input: Evaluation,
): { check: typeof CheckResult.Type; waiver?: string } {
  const now = validTimestamp(input.at);
  const matching = input.evidence.filter(
    (item) =>
      item.componentId === component.id &&
      item.check === rule.id &&
      item.repository === input.repository &&
      item.commit === input.commit &&
      rule.acceptedProducers.includes(item.producer) &&
      trusted(item, input, "evidence") &&
      validTimestamp(item.observedAt) <= now &&
      (!input.artifactDigest || item.artifactDigest === input.artifactDigest),
  );
  const fresh = matching.filter(
    (item) =>
      (!item.expiresAt || validTimestamp(item.expiresAt) > now) &&
      (rule.maxAgeHours === undefined ||
        now - validTimestamp(item.observedAt) <= rule.maxAgeHours * 3_600_000),
  );
  const failed = fresh.filter((item) => item.outcome === "failed");
  const passed = fresh.filter((item) => item.outcome === "passed");
  if (passed.length && !failed.length)
    return {
      check: {
        check: rule.id,
        result: "passed",
        reason: "Accepted current evidence matches the evaluated source",
        evidenceIds: passed.map((e) => e.id).sort(),
      },
    };
  const waiver = input.waivers
    .filter(
      (item) =>
        item.componentId === component.id &&
        item.check === rule.id &&
        input.policy.waivers.enabled &&
        !input.policy.waivers.disallowFor.includes(rule.id) &&
        trusted(item, input, "waiver") &&
        validTimestamp(item.issuedAt) <= now &&
        validTimestamp(item.expiresAt) > now &&
        validTimestamp(item.expiresAt) - validTimestamp(item.issuedAt) <=
          input.policy.waivers.maxDurationDays * 86_400_000,
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (waiver)
    return {
      check: {
        check: rule.id,
        result: "waived",
        reason: `Active exception ${waiver.id}: ${waiver.reason}`,
        evidenceIds: failed.map((e) => e.id).sort(),
      },
      waiver: waiver.id,
    };
  if (failed.length)
    return {
      check: {
        check: rule.id,
        result: "failed",
        reason: "Accepted current evidence reports failure (conflicting passes do not override it)",
        evidenceIds: failed.map((e) => e.id).sort(),
      },
    };
  return {
    check: {
      check: rule.id,
      result: matching.length ? "expired" : "missing",
      reason: matching.length
        ? "Required evidence has expired or exceeds the freshness limit"
        : "No accepted, trusted evidence matches this component and source; check provenance, producer, SHA, repository, artifact and time",
      evidenceIds: matching.map((e) => e.id).sort(),
    },
  };
}
function componentDecision(component: Component, input: Evaluation): typeof Decision.Type {
  const rules = input.policy.requirements[input.target];
  const evaluated = (rules?.checks ?? []).map((rule) => evaluateCheck(component, rule, input));
  const checks = evaluated
    .map((result) => result.check)
    .sort((a, b) => (a.check < b.check ? -1 : 1));
  const reasons: string[] = [];
  let blocked = false;
  const contractRelease = component.contractVersion.split("+")[0] ?? "";
  if (
    input.target === "stable" &&
    (contractRelease.startsWith("0.") || contractRelease.includes("-"))
  ) {
    blocked = true;
    reasons.push(
      "Stable readiness requires a >=1.0.0 component contract without a prerelease suffix",
    );
  }
  if (
    component.lifecycle !== input.target &&
    !input.policy.transitions[component.lifecycle].includes(input.target)
  ) {
    blocked = true;
    reasons.push(`Transition ${component.lifecycle} -> ${input.target} is not allowed`);
  }
  if (
    input.useCase === "new-adoption" &&
    (component.lifecycle === "deprecated" || component.lifecycle === "retired")
  ) {
    blocked = true;
    reasons.push(`${component.lifecycle} components are blocked for new adoption`);
  }
  if (!rules) reasons.push(`No policy configured for target ${input.target}`);
  for (const check of checks)
    if (check.result !== "passed" && check.result !== "waived")
      reasons.push(`${check.check}: ${check.reason}`);
  if (checks.some((check) => check.result === "failed")) blocked = true;
  const insufficient =
    !rules || checks.some((check) => check.result === "missing" || check.result === "expired");
  return {
    componentId: component.id,
    lifecycle: component.lifecycle,
    target: input.target,
    package: component.package,
    contractVersion: component.contractVersion,
    packageVersion: component.packageVersion ?? null,
    owners: component.owners,
    gate: blocked ? "blocked" : insufficient ? "insufficient_evidence" : "ready",
    checks,
    reasons,
    activeWaivers: evaluated.flatMap((result) => (result.waiver ? [result.waiver] : [])).sort(),
  };
}
function projectEvidence(
  byId: Map<string, Evidence>,
  id: string,
  componentId: string,
  check: string,
) {
  const item = byId.get(id);
  ensure(
    item !== undefined && item.componentId === componentId && item.check === check,
    "Selected evidence association mismatch",
  );
  const metadata = {
    id,
    producer: item.producer,
    observedAt: item.observedAt,
    provenance: item.provenance,
  };
  if (item.sourceUrl === undefined) return metadata;
  return { ...metadata, sourceUrl: item.sourceUrl };
}
/** Attestation maps must be supplied by the host adapter, never decoded from project files. */
export function evaluate(raw: unknown, reportVersion?: 1): GovernanceReportV1;
export function evaluate(raw: unknown, reportVersion: 2): GovernanceReportV2;
export function evaluate(raw: unknown, reportVersion: 1 | 2): GovernanceReport;
export function evaluate(raw: unknown, reportVersion: 1 | 2 = 1): GovernanceReport {
  ensure(reportVersion === 1 || reportVersion === 2, "Unsupported report version");
  const input = decode(Evaluation, raw);
  decodeRegistry(input.registry);
  decodePolicy(input.policy);
  input.evidence.forEach(decodeEvidence);
  input.waivers.forEach((w) => {
    validTimestamp(w.issuedAt);
    validTimestamp(w.expiresAt);
  });
  validTimestamp(input.at);
  unique(
    input.evidence.map((e) => e.id),
    "evidence ID",
  );
  unique(
    input.waivers.map((w) => w.id),
    "waiver ID",
  );
  const decisions = [...input.registry.components]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((component) => componentDecision(component, input));
  const verified =
    decisions.length > 0 && decisions.every((d) => d.gate === "ready" && d.checks.length > 0);
  const report: GovernanceReportV1 = {
    schemaVersion: 1,
    evaluatedAt: input.at,
    policyVersion: input.policy.policyVersion,
    commit: input.commit,
    repository: input.repository,
    assurance: input.mode === "demo" ? "demo" : verified ? "verified-inputs" : "unverified",
    target: input.target,
    publication: "unknown",
    deployment: "unknown",
    adoption: "unknown",
    decisions,
  };
  if (reportVersion === 1) return report;
  const byId = new Map(input.evidence.map((item) => [item.id, item]));
  return {
    ...report,
    schemaVersion: 2,
    decisions: report.decisions.map((decision) => ({
      ...decision,
      checks: decision.checks.map((check) => ({
        ...check,
        evidence: check.evidenceIds.map((id) =>
          projectEvidence(byId, id, decision.componentId, check.check),
        ),
      })),
    })),
  };
}
/** M0 deliberately treats every policy change as protected, including apparent strengthening. */
export function comparePolicy(
  previous: unknown,
  proposed: unknown,
  ownerAttested: boolean,
): { gate: "ready" | "blocked"; reason: string } {
  const changed = canonicalJson(decodePolicy(previous)) !== canonicalJson(decodePolicy(proposed));
  return changed && !ownerAttested
    ? { gate: "blocked", reason: "Policy change requires independent designated-owner review" }
    : {
        gate: "ready",
        reason: changed ? "Owner review supplied by host adapter" : "Policy unchanged",
      };
}
