import type { GovernanceReport } from "./index.ts";

/** Run after strict structural validation. This checks consistency, never authenticity. */
export function reportSemanticsValid(report: GovernanceReport): boolean {
  const canonicalTime = (value: string): number => {
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
  };
  const now = canonicalTime(report.evaluatedAt);
  if (!Number.isFinite(now)) return false;
  if (report.schemaVersion === 1) return true;
  const selected = new Set<string>();
  const components = new Set<string>();
  for (const decision of report.decisions) {
    if (components.has(decision.componentId)) return false;
    components.add(decision.componentId);
    const checks = new Set<string>();
    for (const check of decision.checks) {
      if (checks.has(check.check)) return false;
      checks.add(check.check);
      if (check.evidence.length !== check.evidenceIds.length) return false;
      const sorted = [...check.evidenceIds].sort();
      for (const [index, item] of check.evidence.entries()) {
        if (
          item.id !== check.evidenceIds[index] ||
          item.id !== sorted[index] ||
          selected.has(item.id)
        )
          return false;
        selected.add(item.id);
        if (!(canonicalTime(item.observedAt) <= now)) return false;
      }
    }
  }
  return true;
}
