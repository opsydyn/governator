import { Schema } from "effect";
import { Commit, SemVer, Timestamp } from "@governanator/core";
import { ApiSnapshotSchema } from "./api-schema.ts";
const text = Schema.String.check(Schema.isMinLength(1));
export const Hash = Schema.String.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/));
export const ChangeKind = Schema.Literals(["none", "patch", "minor", "major"]);
export const PackageManifest = Schema.Struct({
  name: text,
  version: SemVer,
  type: text,
  exports: Schema.Unknown,
  peerDependencies: Schema.Record(Schema.String, Schema.String),
  dependencies: Schema.Record(Schema.String, Schema.String),
});
export const ReleaseArtifact = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  artifactDigest: Hash,
  files: Schema.Record(Schema.String, Hash),
  manifest: PackageManifest,
  api: ApiSnapshotSchema,
});
export type ReleaseArtifact = typeof ReleaseArtifact.Type;
export const ChangeRecord = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  kind: ChangeKind,
  reason: Schema.String.check(Schema.isMinLength(16)),
  issue: text,
  impacts: Schema.NonEmptyArray(
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
  components: Schema.NonEmptyArray(
    Schema.Struct({
      componentId: text,
      kind: ChangeKind,
      reason: Schema.String.check(Schema.isMinLength(16)),
    }),
  ),
  documents: Schema.Struct({
    migrationGuide: text,
    manualMigrationPlan: text,
    consumerImpact: text,
    compatibilityMatrix: text,
  }),
});
export type ChangeRecord = typeof ChangeRecord.Type;
export const SimulatedReview = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  provenance: Schema.Literal("simulated"),
  commit: Commit,
  artifactDigest: Hash,
  inputDigest: Hash,
  reviewer: text,
  roles: Schema.NonEmptyArray(text),
  observedAt: Timestamp,
  expiresAt: Timestamp,
  reason: Schema.String.check(Schema.isMinLength(16)),
});
export type SimulatedReview = typeof SimulatedReview.Type;
export const ReleaseConfig = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  packageDirectory: text,
  declaration: text,
  apiConfig: text,
  baseline: text,
  baselineArchive: text,
  baselineDigest: text,
  mapping: text,
  consumerFixtures: Schema.NonEmptyArray(text),
  changesets: Schema.Array(text),
  classification: Schema.NullOr(text),
  simulatedReview: Schema.NullOr(text),
});
export type ReleaseConfig = typeof ReleaseConfig.Type;
export const CandidateManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  commit: Commit,
  createdAt: Timestamp,
  config: text,
  inputDigest: Hash,
  tarball: text,
  artifact: ReleaseArtifact,
});
export type CandidateManifest = typeof CandidateManifest.Type;
