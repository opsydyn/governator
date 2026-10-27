import { describe, expect, it } from "vitest";
import { applyFixturePolicyTransition } from "../packages/fixture-policy/src/index.ts";
import { fixturePolicy, fixtureStoreWitness, hash } from "./fixture-policy-fixtures.ts";

// Unless a test explicitly supplies a witness, model a witness of the supplied current store.
function applyFixture(input: any) {
  return applyFixturePolicyTransition({
    ...input,
    storeWitness: fixtureStoreWitness(input.expected, input.store),
  });
}

describe("fixture policy lifecycle", () => {
  it("bootstraps with two owners and enrolls a reviewer with possession proof", () => {
    const f = fixturePolicy();
    const boot = applyFixture(f.bootstrap());
    expect(boot.status).toBe("committed");
    const input = f.enrollment(boot.store);
    const result = applyFixture(input);
    expect(result.status).toBe("committed");
    expect(result.store?.version).toBe(2);
    expect(result.store?.pendingChallenges).toHaveLength(0);
    expect(result.store?.consumedChallenges).toHaveLength(1);
  });
  it("rejects one owner or a repeated owner signature", () => {
    const f = fixturePolicy();
    for (const signatures of [
      [f.policySigned.signatures[0]!],
      [f.policySigned.signatures[0]!, f.policySigned.signatures[0]!],
    ]) {
      const input = f.bootstrap();
      input.transition.policy = { ...f.policySigned, signatures };
      expect(applyFixture(input).status).toBe("insufficient_evidence");
    }
  });
  it("rejects a stale compare-and-swap without consuming the challenge", () => {
    const f = fixturePolicy();
    const boot = applyFixture(f.bootstrap());
    const input = f.enrollment(boot.store);
    const committed = applyFixture(input);
    const stale = applyFixture({ ...input, store: committed.store });
    expect(stale.status).toBe("insufficient_evidence");
    expect(stale.store).toEqual(committed.store);
    const interrupted = applyFixture({ ...input, crashMode: "before" });
    expect(interrupted.status).toBe("interrupted");
    expect(interrupted.store).toEqual(input.store);
  });
});

describe("checkpoint and recovery security", () => {
  it("rejects an old store after the independent epoch witness has advanced", () => {
    const f = fixturePolicy();
    const boot = applyFixture(f.bootstrap());
    const input = f.enrollment(boot.store);
    expect(
      applyFixture({
        ...input,
        epochWitness: { repository: f.repository, policyId: f.policyId, epoch: 1 },
      }).status,
    ).toBe("insufficient_evidence");
  });
  it("rejects an impossible nonempty initial policy even with a matching checkpoint", () => {
    const f = fixturePolicy();
    const boot = applyFixture(f.bootstrap());
    const assignment = { ...f.owners[2]!, status: "active", roles: ["design-system-owner"] };
    const invalid = f.signed("policy", { ...f.policy, assignments: [assignment] });
    const store = {
      ...boot.store!,
      policy: invalid,
      checkpoint: { ...boot.store!.checkpoint, policyDigest: hash(invalid.bytes) },
    };
    const next = f.signed("policy", {
      ...f.policy,
      revision: 2,
      previousDigest: store.checkpoint.policyDigest,
      assignments: [{ ...assignment, status: "revoked" }],
    });
    expect(
      applyFixture({
        ...f.base,
        store,
        expectedStoreVersion: 1,
        transition: { kind: "policy", action: "revoke", policy: next, proof: null },
      }).status,
    ).toBe("insufficient_evidence");
  });
  it("allows separately authorized recovery without the old anchor", () => {
    const f = fixturePolicy();
    const boot = applyFixture(f.bootstrap());
    const authorization = f.signed(
      "recovery",
      {
        schemaVersion: 1,
        purpose: "fixture-policy-recovery",
        repository: f.repository,
        policyId: f.policyId,
        priorEpoch: 0,
        nextEpoch: 1,
        rootDigest: hash(f.rootSigned.bytes),
        policyDigest: hash(f.policySigned.bytes),
        auditId: "recovery-1",
        ...f.time,
      },
      [3, 4],
    );
    const result = applyFixture({
      ...f.base,
      anchor: null,
      recoveryAuthority: { owners: f.owners.slice(3, 5), threshold: 2, minimumEpoch: 0 },
      epochWitness: { repository: f.repository, policyId: f.policyId, epoch: 0 },
      store: boot.store,
      expectedStoreVersion: 1,
      transition: { kind: "recovery", root: f.rootSigned, policy: f.policySigned, authorization },
    });
    expect(result.status).toBe("committed");
    expect(result.store?.epoch).toBe(1);
  });
});

describe("authenticated updates", () => {
  it("requires both old and new thresholds for root rotation and retains policy proof", () => {
    const f = fixturePolicy();
    const boot = applyFixture(f.bootstrap());
    const next = {
      ...f.root,
      version: 2,
      previousDigest: hash(f.rootSigned.bytes),
      currentPolicyDigest: hash(f.policySigned.bytes),
      administrators: [f.owners[1]!, f.owners[2]!],
    };
    const attempt = (indexes: number[]) =>
      applyFixture({
        ...f.base,
        store: boot.store,
        expectedStoreVersion: 1,
        transition: { kind: "root", root: f.signed("root", next, indexes) },
      });
    expect(attempt([0, 1]).status).toBe("insufficient_evidence");
    const updated = attempt([0, 1, 2]);
    expect(updated.status).toBe("committed");
    const enrollment = f.enrollment(updated.store);
    enrollment.transition.policy = f.signed(
      "policy",
      JSON.parse(Buffer.from(enrollment.transition.policy.bytes).toString()),
      [1, 2],
    );
    expect(applyFixture(enrollment).status).toBe("committed");
    const forged = {
      ...updated.store!,
      rotationPolicies: [
        {
          policy: f.signed("policy", {
            ...f.policy,
            revision: 3,
            previousDigest: hash(f.policySigned.bytes),
          }),
          policyRootVersion: 1,
        },
      ],
    };
    expect(applyFixture({ ...enrollment, store: forged }).status).toBe("insufficient_evidence");
    expect(attempt([0, 1, 2]).store?.checkpoint.rootVersion).toBe(2);
    expect(
      applyFixture({
        ...f.base,
        store: boot.store,
        expectedStoreVersion: 1,
        transition: { kind: "root", root: f.signed("root", { ...next, threshold: 1 }, [0, 1, 2]) },
      }).status,
    ).toBe("insufficient_evidence");
  });
  it("allows only the specified reviewer change", () => {
    const f = fixturePolicy();
    const boot = applyFixture(f.bootstrap());
    const enroll = f.enrollment(boot.store);
    const result = applyFixture(enroll);
    const current = JSON.parse(Buffer.from(enroll.transition.policy.bytes).toString());
    const change = (action: string, patch: Record<string, unknown>, assignments?: unknown[]) => {
      const next = {
        ...current,
        revision: 3,
        previousDigest: hash(enroll.transition.policy.bytes),
        assignments: assignments ?? [{ ...current.assignments[0], ...patch }],
      };
      return applyFixture({
        ...f.base,
        store: result.store,
        expectedStoreVersion: 2,
        transition: { kind: "policy", action, policy: f.signed("policy", next), proof: null },
      });
    };
    expect(change("roles", { roles: ["api-owner"] }).status).toBe("committed");
    expect(change("revoke", { status: "revoked" }).status).toBe("committed");
    expect(change("remove", {}, []).status).toBe("committed");
    expect(change("roles", { roles: ["api-owner"], status: "revoked" }).status).toBe(
      "insufficient_evidence",
    );
    expect(change("revoke", { status: "revoked", roles: [] }).status).toBe("insufficient_evidence");
  });
  it("rejects replay, invalid signatures, stale clock and crash-before; after crash commits atomically", () => {
    const f = fixturePolicy();
    const boot = applyFixture(f.bootstrap());
    const input = f.enrollment(boot.store);
    const wrong = {
      ...input,
      transition: {
        ...input.transition,
        proof: f.signed("enrollment", input.transition.proof.bytes, [3]),
      },
    };
    expect(applyFixture(wrong).status).toBe("insufficient_evidence");
    expect(applyFixture({ ...input, at: "2026-10-27T10:00:00.000Z" }).status).toBe(
      "insufficient_evidence",
    );
    const before = applyFixture({ ...input, crashMode: "before" });
    expect(before.status).toBe("interrupted");
    expect(before.store?.pendingChallenges).toHaveLength(1);
    const after = applyFixture({ ...input, crashMode: "after" });
    expect(after.status).toBe("committed");
    expect(after.store?.pendingChallenges).toHaveLength(0);
    expect(after.store?.consumedChallenges).toHaveLength(1);
    expect(applyFixture({ ...input, store: after.store }).status).toBe("insufficient_evidence");
    input.store.pendingChallenges[0]![0] = 0;
    expect(before.store?.pendingChallenges[0]?.[0]).not.toBe(0);
  });
});

describe("enrollment and recovery adversaries", () => {
  it("requires a matching pending challenge and fresh proof for a key rotation", () => {
    const f = fixturePolicy();
    const boot = applyFixture(f.bootstrap());
    const enroll = f.enrollment(boot.store);
    const committed = applyFixture(enroll);
    const previous = JSON.parse(Buffer.from(enroll.transition.policy.bytes).toString());
    const replacement = {
      ...f.owners[3]!,
      actorId: f.owners[2]!.actorId,
      status: "active",
      roles: ["design-system-owner"],
    };
    const next = f.signed("policy", {
      ...previous,
      revision: 3,
      previousDigest: hash(enroll.transition.policy.bytes),
      assignments: [replacement],
    });
    const challenge = {
      schemaVersion: 1,
      purpose: "fixture-reviewer-enrollment",
      epoch: 0,
      repository: f.repository,
      policyId: f.policyId,
      revision: 3,
      previousPolicyDigest: hash(enroll.transition.policy.bytes),
      nextPolicyDigest: hash(next.bytes),
      actorId: replacement.actorId,
      keyId: replacement.keyId,
      nonce: "fedcba9876543210fedcba9876543210",
      ...f.time,
    };
    const proof = f.signed("enrollment", challenge, [3]);
    const store = { ...committed.store!, pendingChallenges: [new Uint8Array(proof.bytes)] };
    const input = {
      ...f.base,
      store,
      expectedStoreVersion: 2,
      transition: { kind: "policy", action: "rotate", policy: next, proof },
    };
    expect(applyFixture(input).status).toBe("committed");
    expect(applyFixture({ ...input, store: { ...store, pendingChallenges: [] } }).status).toBe(
      "insufficient_evidence",
    );
    expect(
      applyFixture({
        ...input,
        transition: { ...input.transition, proof: f.signed("enrollment", challenge, [2]) },
      }).status,
    ).toBe("insufficient_evidence");
    expect(
      applyFixture({
        ...input,
        store: { ...store, consumedChallenges: [hash(proof.bytes)] },
      }).status,
    ).toBe("insufficient_evidence");
  });
  it("requires independent two-owner recovery and a matching epoch witness", () => {
    const f = fixturePolicy();
    const boot = applyFixture(f.bootstrap());
    const statement = {
      schemaVersion: 1,
      purpose: "fixture-policy-recovery",
      repository: f.repository,
      policyId: f.policyId,
      priorEpoch: 0,
      nextEpoch: 1,
      rootDigest: hash(f.rootSigned.bytes),
      policyDigest: hash(f.policySigned.bytes),
      auditId: "recovery-1",
      ...f.time,
    };
    const input = {
      ...f.base,
      anchor: null,
      recoveryAuthority: { owners: f.owners.slice(3, 5), threshold: 2, minimumEpoch: 0 },
      epochWitness: { repository: f.repository, policyId: f.policyId, epoch: 0 },
      store: boot.store,
      expectedStoreVersion: 1,
      transition: {
        kind: "recovery",
        root: f.rootSigned,
        policy: f.policySigned,
        authorization: f.signed("recovery", statement, [3, 4]),
      },
    };
    expect(applyFixture({ ...input, recoveryAuthority: null }).status).toBe(
      "insufficient_evidence",
    );
    expect(applyFixture({ ...input, epochWitness: null }).status).toBe("insufficient_evidence");
    expect(
      applyFixture({
        ...input,
        transition: { ...input.transition, authorization: f.signed("recovery", statement, [3]) },
      }).status,
    ).toBe("insufficient_evidence");
    expect(
      applyFixture({
        ...input,
        transition: {
          ...input.transition,
          authorization: f.signed("recovery", { ...statement, nextEpoch: 2 }, [3, 4]),
        },
      }).status,
    ).toBe("insufficient_evidence");
    const recovered = applyFixture(input);
    expect(recovered.status).toBe("committed");
    const enrollment = f.enrollment(recovered.store);
    expect(
      applyFixture({
        ...enrollment,
        anchor: null,
        recoveryAuthority: input.recoveryAuthority,
        epochWitness: { ...input.epochWitness, epoch: 1 },
      }).status,
    ).toBe("committed");
  });
  it("rejects malformed signed policy, unrelated signatures, and counter overflow", () => {
    const f = fixturePolicy();
    const boot = applyFixture(f.bootstrap());
    const input = f.enrollment(boot.store);
    const malformed = f.signed("policy", Buffer.from('{"schemaVersion":1,"schemaVersion":1}'));
    expect(
      applyFixture({
        ...input,
        transition: { ...input.transition, policy: malformed },
      }).status,
    ).toBe("insufficient_evidence");
    const extra = {
      ...input.transition.policy,
      signatures: [
        ...input.transition.policy.signatures,
        ...f.signed("policy", input.transition.policy.bytes, [3]).signatures,
      ],
    };
    expect(
      applyFixture({ ...input, transition: { ...input.transition, policy: extra } }).status,
    ).toBe("insufficient_evidence");
    expect(
      applyFixture({
        ...input,
        expectedStoreVersion: Number.MAX_SAFE_INTEGER,
        store: { ...input.store, version: Number.MAX_SAFE_INTEGER },
      }).status,
    ).toBe("insufficient_evidence");
  });
});

it("rejects a history policy signed by retired owners after a root change", () => {
  const f = fixturePolicy();
  const boot = applyFixture(f.bootstrap());
  const nextRoot = {
    ...f.root,
    version: 2,
    previousDigest: hash(f.rootSigned.bytes),
    currentPolicyDigest: hash(f.policySigned.bytes),
    administrators: [f.owners[2]!, f.owners[3]!],
  };
  const rotated = applyFixture({
    ...f.base,
    store: boot.store,
    expectedStoreVersion: 1,
    transition: { kind: "root", root: f.signed("root", nextRoot, [0, 1, 2, 3]) },
  });
  const enrollment = f.enrollment(boot.store);
  const illicit = enrollment.transition.policy;
  const fakeAssignment = JSON.parse(Buffer.from(illicit.bytes).toString()).assignments[0];
  const store = {
    ...rotated.store!,
    version: 3,
    policy: illicit,
    policyRootVersion: 1,
    consumedChallenges: [hash(enrollment.transition.proof.bytes)],
    policyHistory: [
      ...rotated.store!.policyHistory,
      {
        policy: illicit,
        policyRootVersion: 1,
        at: f.at,
        action: "enroll",
        proof: enrollment.transition.proof,
      },
    ],
    checkpoint: {
      ...rotated.store!.checkpoint,
      policyRevision: 2,
      policyDigest: hash(illicit.bytes),
    },
  };
  const next = f.signed(
    "policy",
    {
      ...f.policy,
      revision: 3,
      previousDigest: hash(illicit.bytes),
      assignments: [{ ...fakeAssignment, status: "revoked" }],
    },
    [2, 3],
  );
  expect(
    applyFixture({
      ...f.base,
      store,
      expectedStoreVersion: 3,
      transition: { kind: "policy", action: "revoke", policy: next, proof: null },
    }).status,
  ).toBe("insufficient_evidence");
});

it("accepts consecutive root rotations with an unchanged policy", () => {
  const f = fixturePolicy();
  const boot = applyFixture(f.bootstrap());
  const root2 = {
    ...f.root,
    version: 2,
    previousDigest: hash(f.rootSigned.bytes),
    currentPolicyDigest: hash(f.policySigned.bytes),
    administrators: [f.owners[2]!, f.owners[3]!],
  };
  const e2 = f.signed("root", root2, [0, 1, 2, 3]);
  const first = applyFixture({
    ...f.base,
    store: boot.store,
    expectedStoreVersion: 1,
    transition: { kind: "root", root: e2 },
  });
  expect(first.status).toBe("committed");
  const e3 = f.signed(
    "root",
    {
      ...root2,
      version: 3,
      previousDigest: hash(e2.bytes),
      administrators: [f.owners[3]!, f.owners[4]!],
    },
    [2, 3, 4],
  );
  const second = applyFixture({
    ...f.base,
    store: first.store,
    expectedStoreVersion: 2,
    transition: { kind: "root", root: e3 },
  });
  expect(second.status).toBe("committed");
  const enroll = f.enrollment(second.store);
  enroll.transition.policy = f.signed("policy", enroll.transition.policy.bytes, [3, 4]);
  expect(applyFixture(enroll).status).toBe("committed");
});

it("rejects duplicate owners, mismatched scope and invalid checkpoint", () => {
  const f = fixturePolicy();
  const invalidRoot = { ...f.root, administrators: [f.owners[0]!, f.owners[0]!] };
  const bad = f.signed("root", invalidRoot, [0, 1]);
  expect(
    applyFixture({
      ...f.bootstrap(),
      anchor: bad,
      transition: { ...f.bootstrap().transition, root: bad },
    }).status,
  ).toBe("insufficient_evidence");
  const boot = applyFixture(f.bootstrap());
  const input = f.enrollment(boot.store);
  expect(
    applyFixture({
      ...input,
      expected: { ...f.base.expected, repository: { ...f.repository, id: 102 } },
    }).status,
  ).toBe("insufficient_evidence");
  expect(
    applyFixture({
      ...input,
      store: {
        ...input.store,
        checkpoint: { ...input.store.checkpoint, rootDigest: hash(input.transition.policy.bytes) },
      },
    }).status,
  ).toBe("insufficient_evidence");
});

it("rejects history that advances from an expired previous policy", () => {
  const f = fixturePolicy();
  const boot = applyFixture(f.bootstrap());
  const t2 = "2026-10-28T09:30:00.000Z";
  const t3 = "2026-10-28T11:00:00.000Z";
  const root2 = {
    ...f.root,
    version: 2,
    previousDigest: hash(f.rootSigned.bytes),
    currentPolicyDigest: hash(f.policySigned.bytes),
    issuedAt: "2026-10-28T09:00:00.000Z",
    expiresAt: "2026-10-29T08:00:00.000Z",
  };
  const rotated = applyFixture({
    ...f.base,
    at: t2,
    store: boot.store,
    expectedStoreVersion: 1,
    transition: { kind: "root", root: f.signed("root", root2) },
  });
  const assignment = { ...f.owners[2]!, status: "active", roles: ["design-system-owner"] };
  const nextPolicy = {
    ...f.policy,
    revision: 2,
    previousDigest: hash(f.policySigned.bytes),
    issuedAt: t3,
    expiresAt: "2026-10-29T10:00:00.000Z",
    assignments: [assignment],
  };
  const signed = f.signed("policy", nextPolicy);
  const proof = f.signed(
    "enrollment",
    {
      schemaVersion: 1,
      purpose: "fixture-reviewer-enrollment",
      epoch: 0,
      repository: f.repository,
      policyId: f.policyId,
      revision: 2,
      previousPolicyDigest: hash(f.policySigned.bytes),
      nextPolicyDigest: hash(signed.bytes),
      actorId: assignment.actorId,
      keyId: assignment.keyId,
      nonce: "0123456789abcdef0123456789abcdef",
      issuedAt: t3,
      expiresAt: "2026-10-29T10:00:00.000Z",
    },
    [2],
  );
  const store = {
    ...rotated.store!,
    version: 3,
    policy: signed,
    policyRootVersion: 2,
    consumedChallenges: [hash(proof.bytes)],
    policyHistory: [
      ...rotated.store!.policyHistory,
      { policy: signed, policyRootVersion: 2, at: t3, action: "enroll", proof },
    ],
    checkpoint: {
      ...rotated.store!.checkpoint,
      policyRevision: 2,
      policyDigest: hash(signed.bytes),
      lastTime: t3,
    },
  };
  const revoke = f.signed("policy", {
    ...nextPolicy,
    revision: 3,
    previousDigest: hash(signed.bytes),
    assignments: [{ ...assignment, status: "revoked" }],
  });
  expect(
    applyFixture({
      ...f.base,
      at: t3,
      store,
      expectedStoreVersion: 3,
      transition: { kind: "policy", action: "revoke", policy: revoke, proof: null },
    }).status,
  ).toBe("insufficient_evidence");
});

it("rejects restoring an old pending challenge after the separate store witness advances", () => {
  const f = fixturePolicy();
  const boot = applyFixture(f.bootstrap());
  const input = f.enrollment(boot.store);
  const committed = applyFixture(input);
  expect(committed.status).toBe("committed");
  const witness = {
    repository: f.repository,
    policyId: f.policyId,
    epoch: committed.store!.epoch,
    version: committed.store!.version,
    rootDigest: committed.store!.checkpoint.rootDigest,
    policyDigest: committed.store!.checkpoint.policyDigest,
    lastTime: committed.store!.checkpoint.lastTime,
    consumedChallenges: committed.store!.consumedChallenges,
  };
  const restored = applyFixturePolicyTransition({ ...input, storeWitness: witness });
  expect(restored.status).toBe("insufficient_evidence");
  const missing = applyFixturePolicyTransition({ ...input, storeWitness: null });
  expect(missing.status).toBe("insufficient_evidence");
});

it("rejects replay of an enrollment proof from a previous recovery epoch", () => {
  const f = fixturePolicy();
  const boot = applyFixture(f.bootstrap());
  const firstInput = f.enrollment(boot.store);
  const committed = applyFixture(firstInput);
  const statement = {
    schemaVersion: 1,
    purpose: "fixture-policy-recovery",
    repository: f.repository,
    policyId: f.policyId,
    priorEpoch: 0,
    nextEpoch: 1,
    rootDigest: hash(f.rootSigned.bytes),
    policyDigest: hash(f.policySigned.bytes),
    auditId: "recovery-replay",
    ...f.time,
  };
  const authority = { owners: f.owners.slice(3, 5), threshold: 2, minimumEpoch: 0 };
  const recovered = applyFixture({
    ...f.base,
    anchor: null,
    recoveryAuthority: authority,
    store: committed.store,
    expectedStoreVersion: 2,
    transition: {
      kind: "recovery",
      root: f.rootSigned,
      policy: f.policySigned,
      authorization: f.signed("recovery", statement, [3, 4]),
    },
  });
  expect(recovered.status).toBe("committed");
  const replay = {
    ...firstInput,
    anchor: null,
    recoveryAuthority: authority,
    epochWitness: { repository: f.repository, policyId: f.policyId, epoch: 1 },
    store: {
      ...recovered.store!,
      pendingChallenges: [new Uint8Array(firstInput.transition.proof.bytes)],
    },
    expectedStoreVersion: 3,
  };
  expect(applyFixture(replay).status).toBe("insufficient_evidence");
});

it("rejects recovery before the independently witnessed time floor even if the checkpoint is missing", () => {
  const f = fixturePolicy();
  const boot = applyFixture(f.bootstrap());
  const statement = {
    schemaVersion: 1,
    purpose: "fixture-policy-recovery",
    repository: f.repository,
    policyId: f.policyId,
    priorEpoch: 0,
    nextEpoch: 1,
    rootDigest: hash(f.rootSigned.bytes),
    policyDigest: hash(f.policySigned.bytes),
    auditId: "recovery-clock",
    ...f.time,
  };
  const input = {
    ...f.base,
    anchor: null,
    recoveryAuthority: { owners: f.owners.slice(3, 5), threshold: 2, minimumEpoch: 0 },
    store: boot.store,
    expectedStoreVersion: 1,
    at: "2026-10-27T11:30:00.000Z",
    transition: {
      kind: "recovery",
      root: f.rootSigned,
      policy: f.policySigned,
      authorization: f.signed("recovery", statement, [3, 4]),
    },
  };
  expect(applyFixture(input).status).toBe("insufficient_evidence");
  const witness = fixtureStoreWitness(input.expected, boot.store);
  expect(
    applyFixturePolicyTransition({
      ...input,
      store: { ...boot.store, checkpoint: null },
      storeWitness: witness,
    }).status,
  ).toBe("insufficient_evidence");
  expect(applyFixturePolicyTransition({ ...input, storeWitness: null }).status).toBe(
    "insufficient_evidence",
  );
  const missingStore = { ...input, at: f.at, store: null, storeWitness: witness };
  const recovered = applyFixturePolicyTransition(missingStore);
  expect(recovered.status).toBe("committed");
  expect(recovered.store?.version).toBe(2);
});

it("rejects a forged consumed list even when the witnessed store version is unchanged", () => {
  const f = fixturePolicy();
  const boot = applyFixture(f.bootstrap());
  const input = f.enrollment(boot.store);
  const committed = applyFixture(input);
  const witness = fixtureStoreWitness(input.expected, committed.store);
  const forged = { ...committed.store!, consumedChallenges: [] };
  expect(
    applyFixturePolicyTransition({
      ...input,
      store: forged,
      expectedStoreVersion: 2,
      storeWitness: witness,
    }).status,
  ).toBe("insufficient_evidence");
});
