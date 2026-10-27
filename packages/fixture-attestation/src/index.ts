import { createHash, createPublicKey } from "node:crypto";
import { verifyEd25519 } from "./crypto.ts";
import { Schema } from "effect";
import { parseStrictJson } from "./json.ts";

export const PAYLOAD_TYPE = "application/vnd.in-toto+json";
export const STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
export const PREDICATE_TYPE = "https://governanator.dev/attestation/reviewer-approval/v1";
const DAY = 86_400_000;
const text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const identity = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
const hash = Schema.String.check(Schema.isPattern(/^sha256:[0-9a-f]{64}$/));
const time = Schema.String.check(Schema.isPattern(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/));
const repo = Schema.Struct({
  provider: Schema.Literal("github"),
  host: Schema.String.check(
    Schema.isPattern(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
    Schema.isMaxLength(253),
  ),
  id: identity,
});
const scopeSchema = Schema.Struct({
  repository: repo,
  pullRequest: identity,
  commit: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/)),
  package: text,
  packageVersion: Schema.String.check(
    Schema.isMaxLength(256),
    Schema.isPattern(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[\da-zA-Z-]*[a-zA-Z-][\da-zA-Z-]*)(?:\.(?:0|[1-9]\d*|[\da-zA-Z-]*[a-zA-Z-][\da-zA-Z-]*))*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/,
    ),
  ),
  baselineDigest: hash,
  candidateDigest: hash,
  inputDigest: hash,
  releasePolicyId: text,
  releasePolicyDigest: hash,
  authorizationPolicyId: text,
  authorizationPolicyDigest: hash,
  candidateCreatedAt: time,
  distributedChange: Schema.Boolean,
  major: Schema.Boolean,
});
const role = Schema.Literals(["design-system-owner", "api-owner"]);
const assignmentSchema = Schema.Struct({
  keyId: hash,
  publicKey: Schema.String.check(Schema.isMaxLength(100)),
  actorId: identity,
  status: Schema.Literals(["active", "revoked", "unknown"]),
  roles: Schema.Array(role).check(Schema.isMaxLength(2)),
});
const policySchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  id: text,
  repository: repo,
  revision: identity,
  observedAt: time,
  expiresAt: time,
  assignments: Schema.Array(assignmentSchema).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
});
const checkpointSchema = Schema.Struct({
  policyId: text,
  revision: identity,
  policyDigest: hash,
  observedAt: time,
  expiresAt: time,
});
const envelopeSchema = Schema.Struct({
  payloadType: Schema.Literal(PAYLOAD_TYPE),
  payload: Schema.String.check(Schema.isMaxLength(44_000)),
  signatures: Schema.Array(
    Schema.Struct({ keyid: hash, sig: Schema.String.check(Schema.isMaxLength(100)) }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(1)),
});
const statementSchema = Schema.Struct({
  _type: Schema.Literal(STATEMENT_TYPE),
  subject: Schema.Array(
    Schema.Struct({
      name: text,
      digest: Schema.Struct({ sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)) }),
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(1)),
  predicateType: Schema.Literal(PREDICATE_TYPE),
  predicate: Schema.Struct({
    schemaVersion: Schema.Literal(1),
    purpose: Schema.Literal("reviewer-approval"),
    scope: scopeSchema,
    actorId: identity,
    reviewId: identity,
    issuedAt: time,
    expiresAt: time,
  }),
});
const decode = <S extends Schema.ConstraintDecoder<unknown, never>>(
  schema: S,
  value: unknown,
): S["Type"] => Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value);
export type FixtureAttestationScope = typeof scopeSchema.Type;
export type FixtureAttestationInput = {
  readonly schemaVersion: 1;
  readonly envelopes: readonly Uint8Array[];
  readonly scope: FixtureAttestationScope;
  readonly policyBytes: Uint8Array;
  readonly at: string;
  readonly checkpoint: typeof checkpointSchema.Type | null;
};
export type FixtureAttestationResult = {
  readonly schemaVersion: 1;
  readonly assurance: "fixture-only";
  readonly status: "matched" | "insufficient_evidence";
  readonly reasons: readonly "invalid_evidence"[];
};

/** DSSE pre-authentication encoding; lengths count UTF-8 bytes. */
export function dssePae(type: string, payload: Uint8Array): Uint8Array {
  const typeBytes = Buffer.from(type, "utf8");
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${typeBytes.length} `),
    typeBytes,
    Buffer.from(` ${payload.length} `),
    payload,
  ]);
}
function check(condition: unknown): asserts condition {
  if (!condition) throw new Error("invalid");
}
function copied(value: unknown, limit: number): Uint8Array {
  check(
    value instanceof Uint8Array &&
      value.byteLength <= limit &&
      !(value.buffer instanceof SharedArrayBuffer),
  );
  return Uint8Array.from(value);
}
function base64(value: string, max: number): Buffer {
  check(
    value.length > 0 &&
      value.length <= Math.ceil(max / 3) * 4 &&
      /^[A-Za-z0-9+/_-]+={0,2}$/.test(value),
  );
  check(!(/[+/]/.test(value) && /[-_]/.test(value)));
  const unpadded = value.replace(/=+$/, "");
  check(unpadded.length % 4 !== 1 && (!value.includes("=") || value.length % 4 === 0));
  const result = Buffer.from(unpadded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  check(
    result.length <= max &&
      result.toString("base64").replace(/=+$/, "") ===
        unpadded.replace(/-/g, "+").replace(/_/g, "/"),
  );
  return result;
}
function digest(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function timestamp(value: string): number {
  const n = Date.parse(value);
  check(Number.isFinite(n) && new Date(n).toISOString() === value);
  return n;
}
function fresh(observed: string, expires: string, at: number): boolean {
  const start = timestamp(observed),
    end = timestamp(expires);
  return start <= at && at - start <= DAY && end > at && end > start && end - start <= DAY;
}
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function publicKey(encoded: string, id: string) {
  // SPKI has a single canonical encoding; compare both DER and fingerprint.
  const der = base64(encoded, 44);
  check(der.length === 44 && digest(der) === id && der.toString("base64") === encoded);
  const key = createPublicKey({ key: der, type: "spki", format: "der" });
  check(
    key.asymmetricKeyType === "ed25519" && key.export({ type: "spki", format: "der" }).equals(der),
  );
  return der;
}
function verifyInput(raw: unknown): void {
  check(raw !== null && typeof raw === "object" && !Array.isArray(raw));
  const input = raw as Record<string, unknown>;
  check(
    Object.keys(input).sort().join(",") ===
      "at,checkpoint,envelopes,policyBytes,schemaVersion,scope" && input.schemaVersion === 1,
  );
  const scope = decode(scopeSchema, input.scope);
  const at = timestamp(decode(time, input.at));
  const created = timestamp(scope.candidateCreatedAt);
  check(scope.distributedChange && created <= at && at - created <= DAY);
  check(
    Array.isArray(input.envelopes) && input.envelopes.length >= 1 && input.envelopes.length <= 8,
  );
  const envelopes = input.envelopes.map((v) => copied(v, 65_536));
  const policyBytes = copied(input.policyBytes, 65_536);
  check(digest(policyBytes) === scope.authorizationPolicyDigest);
  const policy = decode(policySchema, parseStrictJson(policyBytes, 65_536));
  const checkpoint = decode(checkpointSchema, input.checkpoint);
  check(policy.id === scope.authorizationPolicyId && same(policy.repository, scope.repository));
  check(
    checkpoint.policyId === policy.id &&
      checkpoint.revision === policy.revision &&
      checkpoint.policyDigest === scope.authorizationPolicyDigest,
  );
  check(
    fresh(policy.observedAt, policy.expiresAt, at) &&
      fresh(checkpoint.observedAt, checkpoint.expiresAt, at),
  );
  const keyIds = new Set<string>(),
    actorIds = new Set<number>();
  const keys = new Map<
    string,
    { assignment: typeof assignmentSchema.Type; key: ReturnType<typeof publicKey> }
  >();
  for (const assignment of policy.assignments) {
    check(
      !keyIds.has(assignment.keyId) &&
        !actorIds.has(assignment.actorId) &&
        new Set(assignment.roles).size === assignment.roles.length,
    );
    keyIds.add(assignment.keyId);
    actorIds.add(assignment.actorId);
    keys.set(assignment.keyId, {
      assignment,
      key: publicKey(assignment.publicKey, assignment.keyId),
    });
  }
  const seenActors = new Set<number>(),
    seenReviews = new Set<number>(),
    roles = new Set<string>();
  for (const envelopeBytes of envelopes) {
    const envelope = decode(envelopeSchema, parseStrictJson(envelopeBytes, 65_536));
    const signature = envelope.signatures[0]!;
    const selected = keys.get(signature.keyid);
    check(selected && selected.assignment.status === "active");
    const payload = base64(envelope.payload, 32_768),
      sig = base64(signature.sig, 64);
    check(verifyEd25519(selected.key, dssePae(PAYLOAD_TYPE, payload), sig));
    const statement = decode(statementSchema, parseStrictJson(payload, 32_768));
    const predicate = statement.predicate;
    check(
      same(predicate.scope, scope) &&
        statement.subject[0]!.name === scope.package &&
        `sha256:${statement.subject[0]!.digest.sha256}` === scope.candidateDigest,
    );
    check(
      predicate.actorId === selected.assignment.actorId &&
        !seenActors.has(predicate.actorId) &&
        !seenReviews.has(predicate.reviewId),
    );
    seenActors.add(predicate.actorId);
    seenReviews.add(predicate.reviewId);
    const issued = timestamp(predicate.issuedAt),
      expires = timestamp(predicate.expiresAt);
    check(
      issued >= created &&
        issued <= at &&
        expires > at &&
        expires > issued &&
        expires - issued <= DAY,
    );
    for (const allowed of selected.assignment.roles) roles.add(allowed);
  }
  check(roles.has("design-system-owner") && (!scope.major || roles.has("api-owner")));
}
/** Consistency check for injected fixtures only; not an authorization capability. */
export function verifyFixtureAttestations(input: unknown): FixtureAttestationResult {
  try {
    verifyInput(input);
    return { schemaVersion: 1, assurance: "fixture-only", status: "matched", reasons: [] };
  } catch {
    return {
      schemaVersion: 1,
      assurance: "fixture-only",
      status: "insufficient_evidence",
      reasons: ["invalid_evidence"],
    };
  }
}
