import { createHash, generateKeyPairSync, sign } from "node:crypto";

export const PAYLOAD_TYPE = "application/vnd.in-toto+json";
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
export const hash = (value: Uint8Array) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
export const pae = (type: string, payload: Uint8Array) =>
  Buffer.concat([
    Buffer.from(`DSSEv1 ${Buffer.byteLength(type)} ${type} ${payload.length} `),
    payload,
  ]);

export function fixtureAttestations(separate = false) {
  const repository = { provider: "github", host: "github.com", id: 101 };
  const keys = [generateKeyPairSync("ed25519"), generateKeyPairSync("ed25519")];
  const assignments = keys.map((key, index) => {
    const der = key.publicKey.export({ type: "spki", format: "der" });
    return {
      keyId: hash(der),
      publicKey: der.toString("base64"),
      actorId: 201 + index,
      status: "active",
      roles: separate
        ? [index === 0 ? "design-system-owner" : "api-owner"]
        : ["design-system-owner", "api-owner"],
    };
  });
  const policy = {
    schemaVersion: 1,
    id: "fixture-owners-v1",
    repository,
    revision: 2,
    observedAt: "2026-10-27T09:00:00.000Z",
    expiresAt: "2026-10-28T09:00:00.000Z",
    assignments,
  };
  const policyBytes = bytes(policy);
  const scope = {
    repository,
    pullRequest: 17,
    commit: "a".repeat(40),
    package: "@example/ui",
    packageVersion: "2.0.0",
    baselineDigest: `sha256:${"1".repeat(64)}`,
    candidateDigest: `sha256:${"2".repeat(64)}`,
    inputDigest: `sha256:${"3".repeat(64)}`,
    releasePolicyId: "release-v1",
    releasePolicyDigest: `sha256:${"4".repeat(64)}`,
    authorizationPolicyId: policy.id,
    authorizationPolicyDigest: hash(policyBytes),
    candidateCreatedAt: "2026-10-27T10:00:00.000Z",
    distributedChange: true,
    major: true,
  };
  function envelope(index = 0, overrides: Record<string, unknown> = {}) {
    const statement = {
      _type: "https://in-toto.io/Statement/v1",
      subject: [{ name: scope.package, digest: { sha256: scope.candidateDigest.slice(7) } }],
      predicateType: "https://governanator.dev/attestation/reviewer-approval/v1",
      predicate: {
        schemaVersion: 1,
        purpose: "reviewer-approval",
        scope: structuredClone(scope),
        actorId: assignments[index]!.actorId,
        reviewId: 301 + index,
        issuedAt: "2026-10-27T11:00:00.000Z",
        expiresAt: "2026-10-28T10:00:00.000Z",
        ...overrides,
      },
    };
    return signStatement(statement, index);
  }
  function signStatement(statement: unknown, index = 0) {
    const payload = bytes(statement);
    return bytes({
      payloadType: PAYLOAD_TYPE,
      payload: payload.toString("base64"),
      signatures: [
        {
          keyid: assignments[index]!.keyId,
          sig: sign(null, pae(PAYLOAD_TYPE, payload), keys[index]!.privateKey).toString("base64"),
        },
      ],
    });
  }
  const input = {
    schemaVersion: 1,
    envelopes: separate ? [envelope(0), envelope(1)] : [envelope()],
    scope,
    policyBytes,
    at: "2026-10-27T12:00:00.000Z",
    checkpoint: {
      policyId: policy.id,
      revision: 2,
      policyDigest: hash(policyBytes),
      observedAt: "2026-10-27T11:00:00.000Z",
      expiresAt: "2026-10-28T09:00:00.000Z",
    },
  };
  function refreshPolicy() {
    input.policyBytes = bytes(policy);
    input.scope.authorizationPolicyDigest = hash(input.policyBytes);
    input.checkpoint.policyDigest = hash(input.policyBytes);
    input.checkpoint.revision = policy.revision;
  }
  return { input, envelope, signStatement, refreshPolicy, keys, assignments, policy, bytes };
}
