import { Data, Schema, Match } from "effect";
import {
  Commit,
  Timestamp,
  ComponentId,
  Registry,
  Policy,
  Evidence,
  Waiver,
  VersionedReport,
  ReleaseSummary,
} from "@governanator/core";
import { Hash, ReleaseArtifact } from "@governanator/versioning";
const text = Schema.String.check(Schema.isMinLength(1));
export class QueryError extends Data.TaggedError("QueryError")<{
  readonly code: string;
  readonly message: string;
}> {}
export function queryEnsure(
  value: boolean,
  message: string,
  code = "invalid_snapshot",
): asserts value {
  return Match.value(value).pipe(
    Match.when(false, () => {
      throw new QueryError({ code, message });
    }),
    Match.orElse(() => undefined),
  );
}
export const QueryScope = Schema.Literals([
  "recorded-snapshot",
  "pure-unverified-evaluation",
  "derived-guidance",
]);
export const QueryEnvelope = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  snapshotDigest: Hash,
  sourceCommit: Commit,
  evaluatedAt: Timestamp,
  provenance: Schema.Literals(["unverified-snapshot", "simulated-snapshot"]),
  scope: Schema.Literals(["recorded-snapshot", "pure-unverified-evaluation", "derived-guidance"]),
  data: Schema.Json,
  limitations: Schema.Array(text),
});
const Change = Schema.Struct({
  componentId: Schema.NullOr(ComponentId),
  exportName: text,
  prop: Schema.optionalKey(text),
  bump: Schema.Literals(["major", "minor", "unknown"]),
  message: text,
});
export const RecordedRelease = Schema.Struct({
  ...ReleaseSummary.fields,
  schemaVersion: Schema.Literal(1),
  packageId: text,
  publication: Schema.Literal("unknown"),
  deployment: Schema.Literal("unknown"),
  adoption: Schema.Literal("unknown"),
  distributedChange: Schema.Boolean,
  changedFiles: Schema.Array(text),
  detectedChanges: Schema.Array(Change),
  policyVersion: text,
  testReceipt: text,
  reproducedArtifactDigest: Hash,
  baselineSource: Schema.Literal("explicit-local-fixture"),
  consumerChecks: Schema.optionalKey(
    Schema.Struct({
      result: Schema.Literals(["passed", "failed"]),
      fixtures: Schema.Array(text),
      diagnostics: Schema.Array(Schema.String),
      compilerVersion: text,
      artifactDigest: Hash,
    }),
  ),
});
export const SnapshotPayload = Schema.Struct({
  report: VersionedReport,
  registry: Registry,
  policy: Policy,
  evidence: Schema.Array(Evidence),
  reportedEvidence: Schema.Array(Evidence),
  waivers: Schema.Array(Waiver),
  baseline: Schema.NullOr(ReleaseArtifact),
  candidate: Schema.NullOr(ReleaseArtifact),
  release: Schema.NullOr(RecordedRelease),
  documents: Schema.Record(Schema.String, Schema.String),
});
export const SnapshotBody = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  sourceCommit: Commit,
  repository: text,
  policyVersion: text,
  generatedAt: Timestamp,
  expiresAt: Timestamp,
  evaluatedAt: Timestamp,
  provenance: Schema.Literals(["unverified-snapshot", "simulated-snapshot"]),
  selection: Schema.Struct({
    report: text,
    release: Schema.NullOr(text),
    config: Schema.NullOr(text),
  }),
  files: Schema.Array(
    Schema.Struct({
      path: text,
      kind: text,
      size: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      digest: Hash,
    }),
  ),
  payload: SnapshotPayload,
});
export const Snapshot = Schema.Struct({ ...SnapshotBody.fields, digest: Hash });
export type Snapshot = typeof Snapshot.Type;
export type QueryResult = typeof QueryEnvelope.Type;
export interface SnapshotSelection {
  readonly report: string;
  readonly release?: string;
  readonly config?: string;
}
export type QuerySnapshot = Snapshot & {
  readonly computedDiff: ReturnType<typeof import("@governanator/versioning").diffApi> | null;
};
export { freeze } from "./values.ts";

export function queryJsonSchema() {
  return Schema.toJsonSchemaDocument(QueryEnvelope, { onExcessProperty: "error" });
}
