import { createHash, generateKeyPairSync, sign } from "node:crypto";

export const TYPES = {
  root: "application/vnd.governanator.fixture-root.v1+json",
  policy: "application/vnd.governanator.fixture-policy.v1+json",
  enrollment: "application/vnd.governanator.fixture-enrollment.v1+json",
  recovery: "application/vnd.governanator.fixture-recovery.v1+json",
} as const;
export const hash = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
export const pae = (type: string, bytes: Uint8Array) =>
  Buffer.concat([
    Buffer.from(`DSSEv1 ${Buffer.byteLength(type)} ${type} ${bytes.byteLength} `),
    bytes,
  ]);
export function fixtureStoreWitness(
  expected: { repository: unknown; policyId: string },
  store: any,
) {
  return {
    ...expected,
    epoch: store?.epoch ?? 0,
    version: store?.version ?? 0,
    rootDigest: store?.checkpoint?.rootDigest ?? null,
    policyDigest: store?.checkpoint?.policyDigest ?? null,
    lastTime: store?.checkpoint?.lastTime ?? null,
    consumedChallenges: [...(store?.consumedChallenges ?? [])],
  };
}
export function fixturePolicy() {
  const repository = { provider: "github", host: "github.com", id: 101 } as const;
  const policyId = "fixture-policy";
  const at = "2026-10-27T12:00:00.000Z";
  const time = { issuedAt: "2026-10-27T11:00:00.000Z", expiresAt: "2026-10-28T10:00:00.000Z" };
  const keys = Array.from({ length: 5 }, () => generateKeyPairSync("ed25519"));
  const owners = keys.map((key, index) => {
    const der = key.publicKey.export({ type: "spki", format: "der" });
    return { actorId: 201 + index, keyId: hash(der), publicKey: der.toString("base64") };
  });
  const root = {
    schemaVersion: 1,
    repository,
    policyId,
    version: 1,
    previousDigest: null,
    currentPolicyDigest: null,
    ...time,
    threshold: 2,
    administrators: owners.slice(0, 2),
  };
  const policy = {
    schemaVersion: 1,
    repository,
    id: policyId,
    revision: 1,
    previousDigest: null,
    ...time,
    assignments: [] as Array<{
      actorId: number;
      keyId: string;
      publicKey: string;
      status: string;
      roles: string[];
    }>,
  };
  function signed(type: keyof typeof TYPES, value: unknown, indexes = [0, 1]) {
    const bytes = value instanceof Uint8Array ? Buffer.from(value) : encode(value);
    return {
      bytes,
      signatures: indexes.map((i) => ({
        keyId: owners[i]!.keyId,
        signature: sign(null, pae(TYPES[type], bytes), keys[i]!.privateKey).toString("base64"),
      })),
    };
  }
  const rootSigned = signed("root", root);
  const policySigned = signed("policy", policy);
  const base = {
    schemaVersion: 1,
    expected: { repository, policyId },
    anchor: rootSigned,
    recoveryAuthority: null,
    epochWitness: { repository, policyId, epoch: 0 },
    storeWitness: fixtureStoreWitness({ repository, policyId }, null),
    at,
    crashMode: "none" as const,
  };
  function bootstrap() {
    return {
      ...base,
      store: null,
      expectedStoreVersion: 0,
      transition: { kind: "bootstrap", root: rootSigned, policy: policySigned },
    };
  }
  function enrollment(store: any) {
    const assignment = { ...owners[2]!, status: "active", roles: ["design-system-owner"] };
    const next = {
      ...policy,
      revision: 2,
      previousDigest: hash(policySigned.bytes),
      assignments: [assignment],
    };
    const policyNext = signed("policy", next);
    const challenge = {
      schemaVersion: 1,
      purpose: "fixture-reviewer-enrollment",
      repository,
      policyId,
      epoch: store.epoch,
      revision: 2,
      previousPolicyDigest: hash(policySigned.bytes),
      nextPolicyDigest: hash(policyNext.bytes),
      actorId: assignment.actorId,
      keyId: assignment.keyId,
      nonce: "0123456789abcdef0123456789abcdef",
      ...time,
    };
    const proof = signed("enrollment", challenge, [2]);
    const prepared = { ...store, pendingChallenges: [new Uint8Array(proof.bytes)] };
    return {
      ...base,
      store: prepared,
      storeWitness: fixtureStoreWitness({ repository, policyId }, store),
      expectedStoreVersion: store.version,
      transition: { kind: "policy", action: "enroll", policy: policyNext, proof },
    };
  }
  return {
    repository,
    policyId,
    at,
    time,
    keys,
    owners,
    root,
    policy,
    rootSigned,
    policySigned,
    base,
    bootstrap,
    enrollment,
    signed,
  };
}
