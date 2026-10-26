import semver from "semver";
import { Baseline, decode, digest, ensure, unique } from "@governanator/core";

export type Bump = "none" | "patch" | "minor" | "major" | "unknown";
const rank = { none: 0, patch: 1, minor: 2, major: 3 };
export function requiredPackageBump(changes: readonly Bump[]): Bump {
  return changes.reduce<Bump>(
    (highest, change) =>
      highest === "unknown" || change === "unknown"
        ? "unknown"
        : rank[highest] >= rank[change]
          ? highest
          : change,
    "none",
  );
}
export interface VersionInput {
  readonly previous: string;
  readonly proposed: string;
  readonly minimum: Bump;
  readonly classified: boolean;
  readonly majorRequirementsVerified: boolean;
}
export function assessVersion(input: VersionInput): {
  eligible: boolean;
  reasons: readonly string[];
} {
  const previous = semver.parse(input.previous);
  const proposed = semver.parse(input.proposed);
  const reasons: string[] = [];
  if (!previous || !proposed) return { eligible: false, reasons: ["Invalid SemVer"] };
  if (!input.classified || input.minimum === "unknown")
    reasons.push("Compatibility is unknown; owner classification is required");
  if (
    previous.major === 0 ||
    proposed.major === 0 ||
    previous.prerelease.length ||
    proposed.prerelease.length
  )
    reasons.push("Prerelease or 0.x contract is not eligible for the stable gate");
  if (semver.lt(proposed, previous)) reasons.push("Version must not decrease");
  const actual =
    proposed.major > previous.major
      ? "major"
      : proposed.minor > previous.minor
        ? "minor"
        : proposed.patch > previous.patch
          ? "patch"
          : "none";
  if (input.minimum !== "unknown" && rank[actual] < rank[input.minimum])
    reasons.push(`Requires at least ${input.minimum}; proposed bump is ${actual}`);
  if (actual === "major" && !input.majorRequirementsVerified)
    reasons.push("Major requires verified owner review, consumer impact and migration evidence");
  return { eligible: reasons.length === 0, reasons };
}
export function verifyBaseline(
  raw: unknown,
  expectedDigest: string,
  packageId: string,
  version: string,
): { baseline: typeof Baseline.Type; publication: "unknown" } {
  ensure(digest(raw) === expectedDigest, "Baseline digest mismatch");
  const baseline = decode(Baseline, raw);
  ensure(
    baseline.package === packageId && baseline.packageVersion === version,
    "Baseline package/version mismatch",
  );
  unique(
    baseline.contracts.map((c) => c.componentId),
    "baseline component",
  );
  for (const contract of baseline.contracts)
    ensure(
      contract.package === packageId && contract.packageVersion === version,
      "Contract does not belong to baseline release",
    );
  return { baseline, publication: "unknown" };
}
