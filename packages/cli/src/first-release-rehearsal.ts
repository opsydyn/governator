/* Offline release rehearsal boundary. No real registry client, credentials, subprocess or publication capability. */
/* oxlint-disable linteffect/no-string-sentinel-const, linteffect/no-return-in-arrow, linteffect/no-throw-in-effect */
import { Schema } from "effect";
import { decode, ensure } from "@governator/core";

const hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
const packageSchema = Schema.Struct({
  name: Schema.Literals([
    "@opsydyn/governator-cli",
    "@opsydyn/governator-mcp",
    "@opsydyn/storybook-addon-governator",
  ]),
  version: Schema.Literal("0.1.0"),
  size: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThan(0),
    Schema.isLessThanOrEqualTo(16 * 1024 * 1024),
  ),
  sha256: hash,
});
const candidateSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  mode: Schema.Literal("local-rehearsal"),
  repository: Schema.Literal("https://github.com/opsydyn/governator"),
  sourceCommit: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/)),
  packages: Schema.Array(packageSchema).check(Schema.isMinLength(3), Schema.isMaxLength(3)),
});
export type Candidate = typeof candidateSchema.Type;
export type Archive = { name: string; version: string; bytes: Uint8Array };
const names = [
  "@opsydyn/governator-cli",
  "@opsydyn/governator-mcp",
  "@opsydyn/storybook-addon-governator",
] as const;
function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}
function checked(candidate: unknown): Candidate {
  const value = decode(candidateSchema, candidate);
  ensure(
    value.packages.every((item, index) => item.name === names[index]),
    "Unexpected or duplicate package set",
  );
  return value;
}
export function createCandidate(sourceCommit: string, archives: readonly Archive[]): Candidate {
  const sorted = [...archives].sort((a, b) => a.name.localeCompare(b.name));
  return checked({
    schemaVersion: 1,
    mode: "local-rehearsal",
    repository: "https://github.com/opsydyn/governator",
    sourceCommit,
    packages: sorted.map((item) => ({
      name: item.name,
      version: item.version,
      size: item.bytes.byteLength,
      sha256: sha256(item.bytes),
    })),
  });
}
export function candidateDigest(candidate: unknown): string {
  const value = checked(candidate);
  // Reconstruct a canonical record; external object key order never determines the review digest.
  const canonical = {
    schemaVersion: value.schemaVersion,
    mode: value.mode,
    repository: value.repository,
    sourceCommit: value.sourceCommit,
    packages: value.packages.map((item) => ({
      name: item.name,
      version: item.version,
      size: item.size,
      sha256: item.sha256,
    })),
  };
  return sha256(new TextEncoder().encode(JSON.stringify(canonical)));
}
export async function rehearseCandidate(
  candidate: unknown,
  reviewedDigest: string,
  sourceCommit: string,
  archives: readonly Archive[],
  afterSnapshot?: () => void,
) {
  const approved = checked(candidate);
  ensure(
    candidateDigest(approved) === reviewedDigest,
    "Candidate differs from explicit review selection",
  );
  ensure(approved.sourceCommit === sourceCommit, "Candidate source commit mismatch");
  // Snapshot every input before any simulated send. The rehearsal has no path-based npm transfer.
  const snapshots = archives.map((archive) => ({
    name: archive.name,
    version: archive.version,
    bytes: Uint8Array.from(archive.bytes),
  }));
  ensure(
    candidateDigest(createCandidate(sourceCommit, snapshots)) === reviewedDigest,
    "Archive set or bytes changed",
  );
  afterSnapshot?.();
  const receipts = snapshots
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      name: item.name,
      version: item.version,
      size: item.bytes.length,
      sha256: sha256(item.bytes),
    }));
  return {
    mode: "offline-rehearsal" as const,
    publishable: false as const,
    sourceCommit,
    reviewedDigest,
    receipts,
  };
}

/** Decode a single npm-compatible fixture upload. This cannot publish or authenticate anything. */
export function verifyNpmFixtureUpload(expected: Candidate["packages"][number], value: unknown) {
  const uploadSchema = Schema.Struct({
    name: Schema.String,
    versions: Schema.Record(
      Schema.String,
      Schema.Struct({ name: Schema.String, version: Schema.String }),
    ),
    _attachments: Schema.Record(Schema.String, Schema.Struct({ data: Schema.String })),
  });
  const body = Schema.decodeUnknownSync(uploadSchema, { onExcessProperty: "ignore" })(value);
  ensure(body.name === expected.name, "Fixture package name mismatch");
  ensure(
    Object.keys(body.versions).length === 1 && Object.hasOwn(body.versions, expected.version),
    "Fixture package version mismatch",
  );
  const manifest = body.versions[expected.version];
  ensure(
    manifest?.name === expected.name && manifest.version === expected.version,
    "Fixture embedded manifest identity mismatch",
  );
  const attachments = Object.values(body._attachments);
  ensure(attachments.length === 1, "Expected one fixture attachment");
  const data = attachments[0]!.data;
  ensure(
    data.length <= 24 * 1024 * 1024 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data),
    "Invalid fixture attachment data",
  );
  const bytes = Buffer.from(data, "base64");
  ensure(
    bytes.length === expected.size && sha256(bytes) === expected.sha256,
    "Fixture received different archive bytes",
  );
  return {
    name: expected.name,
    version: expected.version,
    size: bytes.length,
    sha256: sha256(bytes),
  };
}
