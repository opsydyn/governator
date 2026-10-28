import { decode, ReleaseSummary } from "@governator/core";
import type { checkCandidate } from "./release.ts";
export function releaseSummary(report: Awaited<ReturnType<typeof checkCandidate>>) {
  return decode(ReleaseSummary, {
    gate: report.gate,
    status: report.status,
    assurance: report.assurance,
    baselineVersion: report.baselineVersion,
    candidateVersion: report.candidateVersion,
    baselineDigest: report.baselineDigest,
    candidateDigest: report.candidateDigest,
    sourceCommit: report.sourceCommit,
    evaluatedAt: report.evaluatedAt,
    inputDigest: report.inputDigest,
    minimumBump: report.minimumBump,
    declaredBump: report.declaredBump,
    candidateManifest: report.candidateManifest,
    affectedComponents: report.affectedComponents,
    reasons: report.reasons,
    remediation: report.remediation,
    publishable: report.publishable,
  });
}
