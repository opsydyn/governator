export * from "./api.ts";
export * from "./versions.ts";
import { Baseline, decode, digest, ensure, unique } from "@governanator/core";
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
export * from "./release.ts";
export * from "./consumers.ts";

export { ApiConfigSchema } from "./api-schema.ts";
export * from "./synthetic-review.ts";
