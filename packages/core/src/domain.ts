import { Data, Schema, Result, Match } from "effect";

export class GovernanceError extends Data.TaggedError("GovernanceError")<{
  readonly message: string;
}> {}
const text = Schema.String.check(Schema.isMinLength(1));
export const Lifecycle = Schema.Literals(["draft", "candidate", "stable", "deprecated", "retired"]);
export type Lifecycle = typeof Lifecycle.Type;
export const Check = Schema.Literals([
  "ownership",
  "documentation",
  "unit-test",
  "accessibility",
  "design-approval",
  "visual-review",
  "compatibility-report",
  "changelog",
  "owner-approval",
  "migration-guide",
  "consumer-impact",
]);
export const ComponentId = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/),
);
export const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
);
export const Commit = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/));
export const SemVer = Schema.String.check(
  Schema.isPattern(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[\da-zA-Z-]*[a-zA-Z-][\da-zA-Z-]*)(?:\.(?:0|[1-9]\d*|[\da-zA-Z-]*[a-zA-Z-][\da-zA-Z-]*))*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/,
  ),
);
export const Component = Schema.Struct({
  id: ComponentId,
  name: text,
  package: text,
  owners: Schema.Array(text),
  lifecycle: Lifecycle,
  source: text,
  stories: Schema.Array(text),
  contractVersion: SemVer,
  exportPath: text,
  packageVersion: Schema.optionalKey(SemVer),
  replacementId: Schema.optionalKey(ComponentId),
  documentationUrl: Schema.optionalKey(text),
  figmaUrl: Schema.optionalKey(Schema.NullOr(text)),
});
export type Component = typeof Component.Type;
export const Registry = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  components: Schema.Array(Component),
});
export type Registry = typeof Registry.Type;
const Requirement = Schema.Struct({
  id: Check,
  acceptedProducers: Schema.Array(text),
  maxAgeHours: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
});
const Rules = Schema.Struct({ checks: Schema.Array(Requirement) });
export const Policy = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  policyVersion: text,
  requirements: Schema.Struct({
    draft: Schema.optionalKey(Rules),
    candidate: Schema.optionalKey(Rules),
    stable: Schema.optionalKey(Rules),
    deprecated: Schema.optionalKey(Rules),
    retired: Schema.optionalKey(Rules),
  }),
  transitions: Schema.Struct({
    draft: Schema.Array(Lifecycle),
    candidate: Schema.Array(Lifecycle),
    stable: Schema.Array(Lifecycle),
    deprecated: Schema.Array(Lifecycle),
    retired: Schema.Array(Lifecycle),
  }),
  waivers: Schema.Struct({
    enabled: Schema.Boolean,
    maxDurationDays: Schema.Finite.check(Schema.isGreaterThan(0)),
    disallowFor: Schema.Array(Check),
  }),
});
export type Policy = typeof Policy.Type;
const Provenance = Schema.Literals(["demo", "unverified", "adapter"]);
export const Evidence = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  id: text,
  componentId: ComponentId,
  check: Check,
  outcome: Schema.Literals(["passed", "failed"]),
  producer: text,
  repository: text,
  commit: Commit,
  observedAt: Timestamp,
  expiresAt: Schema.optionalKey(Timestamp),
  artifactDigest: Schema.optionalKey(text),
  sourceUrl: Schema.optionalKey(text),
  provenance: Provenance,
});
export type Evidence = typeof Evidence.Type;
export const Waiver = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  id: text,
  componentId: ComponentId,
  check: Check,
  approver: text,
  reason: text,
  reference: text,
  issuedAt: Timestamp,
  expiresAt: Timestamp,
  provenance: Provenance,
});
export type Waiver = typeof Waiver.Type;
export const Contract = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  componentId: ComponentId,
  contractVersion: SemVer,
  package: text,
  packageVersion: SemVer,
  exportPath: text,
  lifecycle: Lifecycle,
  publicProps: Schema.Record(
    Schema.String,
    Schema.Struct({
      optional: Schema.Boolean,
      type: text,
      default: Schema.optionalKey(Schema.Json),
    }),
  ),
  behaviorContracts: Schema.Array(text),
});
export const ReleaseManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  package: text,
  packageVersion: SemVer,
  artifactDigest: text,
  commit: Commit,
  contracts: Schema.Array(Contract),
  provenance: Provenance,
});
export const ChangeRecord = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  componentId: ComponentId,
  package: text,
  previousContractVersion: SemVer,
  proposedContractVersion: SemVer,
  baselinePackageVersion: SemVer,
  candidatePackageVersion: SemVer,
  baselineDigest: text,
  candidateDigest: text,
  changeKind: Schema.Literals(["major", "minor", "patch", "none", "unknown"]),
  impacts: Schema.Array(
    Schema.Literals([
      "types",
      "behavior",
      "visual",
      "a11y",
      "tokens",
      "runtime",
      "exports",
      "peers",
    ]),
  ),
  detectedChanges: Schema.Array(text),
  declaredChanges: Schema.Array(text),
  migrationReferences: Schema.Array(text),
  consumerConfidence: Schema.Literals(["verified", "inferred", "unknown"]),
});
export const Baseline = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  package: text,
  packageVersion: SemVer,
  origin: Schema.Literal("local-fixture"),
  contracts: Schema.Array(Contract),
});
export const CheckResult = Schema.Struct({
  check: Check,
  result: Schema.Literals(["passed", "failed", "missing", "expired", "waived"]),
  reason: text,
  evidenceIds: Schema.Array(text),
});
export const Decision = Schema.Struct({
  componentId: ComponentId,
  lifecycle: Lifecycle,
  target: Lifecycle,
  package: text,
  contractVersion: SemVer,
  packageVersion: Schema.NullOr(SemVer),
  owners: Schema.optionalKey(Schema.Array(text)),
  compatibility: Schema.optionalKey(
    Schema.Struct({
      gate: Schema.Literals(["ready", "blocked", "insufficient_evidence"]),
      minimumBump: Schema.Literals(["none", "patch", "minor", "major", "unknown"]),
      baselineVersion: SemVer,
      candidateVersion: SemVer,
      baselineContractVersion: SemVer,
      baselineDigest: text,
      candidateDigest: text,
      changes: Schema.Array(text),
      reasons: Schema.Array(text),
      limitations: Schema.Array(text),
    }),
  ),
  gate: Schema.Literals(["ready", "blocked", "insufficient_evidence"]),
  checks: Schema.Array(CheckResult),
  reasons: Schema.Array(text),
  activeWaivers: Schema.Array(text),
});
export const Report = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  evaluatedAt: Timestamp,
  policyVersion: text,
  commit: Commit,
  repository: text,
  assurance: Schema.Literals(["demo", "unverified", "verified-inputs"]),
  target: Lifecycle,
  publication: Schema.Literal("unknown"),
  deployment: Schema.Literal("unknown"),
  adoption: Schema.Literal("unknown"),
  decisions: Schema.Array(Decision),
});
export function reportJsonSchema() {
  return Schema.toJsonSchemaDocument(Report, { onExcessProperty: "error" });
}
export const Evaluation = Schema.Struct({
  registry: Registry,
  policy: Policy,
  evidence: Schema.Array(Evidence),
  waivers: Schema.Array(Waiver),
  target: Lifecycle,
  at: Timestamp,
  commit: Commit,
  repository: text,
  mode: Schema.Literals(["demo", "verified"]),
  useCase: Schema.optionalKey(Schema.Literals(["promotion", "new-adoption", "existing-use"])),
  artifactDigest: Schema.optionalKey(text),
  verifiedEvidenceDigests: Schema.Record(Schema.String, text),
  verifiedWaiverDigests: Schema.Record(Schema.String, text),
});
export type Evaluation = typeof Evaluation.Type;

export function decode<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  input: unknown,
): S["Type"] {
  return Result.match(Schema.decodeUnknownResult(schema, { onExcessProperty: "error" })(input), {
    onSuccess: (value) => value,
    onFailure: (cause) => {
      throw new GovernanceError({ message: String(cause) });
    },
  });
}
export function ensure(condition: boolean, message: string): asserts condition {
  return Match.value(condition).pipe(
    Match.when(false, () => {
      throw new GovernanceError({ message });
    }),
    Match.orElse(() => undefined),
  );
}
export function validTimestamp(value: string): number {
  const time = Date.parse(value);
  // Explicit input validation; this Date never reads the wall clock.
  /* oxlint-disable linteffect/no-new-date-in-domain-logic */
  ensure(
    Number.isFinite(time) && new Date(time).toISOString() === value,
    `Invalid UTC timestamp: ${value}`,
  );
  /* oxlint-enable linteffect/no-new-date-in-domain-logic */
  return time;
}
export function safeRelativePath(value: string): void {
  ensure(
    !/^(\/|[A-Za-z]:|~)/.test(value) &&
      !value.includes("\\") &&
      !value.split("/").includes("..") &&
      !value.includes("\0"),
    `Unsafe repository path: ${value}`,
  );
}
export function unique(values: readonly string[], kind: string): void {
  ensure(new Set(values).size === values.length, `Duplicate ${kind}`);
}
export function decodeRegistry(input: unknown): Registry {
  const registry = decode(Registry, input);
  unique(
    registry.components.map((c) => c.id),
    "component ID",
  );
  unique(
    registry.components.flatMap((c) => c.stories),
    "story identity",
  );
  const byId = new Map(registry.components.map((c) => [c.id, c]));
  for (const component of registry.components) {
    safeRelativePath(component.source);
    component.stories.forEach(safeRelativePath);
    ensure(
      Match.value(component.lifecycle).pipe(
        Match.when("deprecated", () => Boolean(component.replacementId)),
        Match.orElse(() => true),
      ),
      `Deprecated ${component.id} needs replacementId`,
    );
    const seen = new Set<string>([component.id]);
    let replacement = component.replacementId;
    while (replacement) {
      ensure(byId.has(replacement), `Unknown replacement: ${replacement}`);
      ensure(!seen.has(replacement), `Replacement cycle: ${component.id}`);
      seen.add(replacement);
      replacement = byId.get(replacement)?.replacementId;
    }
  }
  return registry;
}
export function decodePolicy(input: unknown): Policy {
  const policy = decode(Policy, input);
  for (const rules of Object.values(policy.requirements))
    unique(
      rules.checks.map((c) => c.id),
      "required check",
    );
  return policy;
}
export function decodeEvidence(input: unknown): Evidence {
  const item = decode(Evidence, input);
  validTimestamp(item.observedAt);
  ensure(
    item.expiresAt === undefined ||
      validTimestamp(item.expiresAt) > validTimestamp(item.observedAt),
    `Evidence ${item.id} expires before observation`,
  );
  return item;
}
export function decodeContract(input: unknown): typeof Contract.Type {
  return decode(Contract, input);
}
