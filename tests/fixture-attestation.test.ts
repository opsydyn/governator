import { describe, expect, test } from "vitest";
import { dssePae, verifyFixtureAttestations } from "../packages/fixture-attestation/src/index.ts";
import { fixtureAttestations, hash } from "./fixture-attestation-fixtures.ts";

describe("offline fixture attestations", () => {
  test("one signer may cover both required roles", () => {
    expect(verifyFixtureAttestations(fixtureAttestations().input)).toEqual({
      schemaVersion: 1,
      assurance: "fixture-only",
      status: "matched",
      reasons: [],
    });
  });
  test("two different signers may cover separate required roles", () => {
    expect(verifyFixtureAttestations(fixtureAttestations(true).input).status).toBe("matched");
  });
  test("the exact candidate digest is required", () => {
    const fixture = fixtureAttestations();
    fixture.input.scope.candidateDigest = `sha256:${"f".repeat(64)}`;
    expect(verifyFixtureAttestations(fixture.input).status).toBe("insufficient_evidence");
  });
  test("DSSE PAE encodes the type and payload lengths as bytes", () => {
    expect(
      Buffer.from(dssePae("http://example.com/HelloWorld", Buffer.from("hello world"))).toString(),
    ).toBe("DSSEv1 29 http://example.com/HelloWorld 11 hello world");
  });
});

describe("fixture verification fails closed", () => {
  test("rechecking the same scope is idempotent", () => {
    const { input } = fixtureAttestations();
    expect(verifyFixtureAttestations(input)).toEqual(verifyFixtureAttestations(input));
  });
  const changes: Record<string, unknown> = {
    repository: { provider: "github", host: "other.example", id: 101 },
    pullRequest: 18,
    commit: "b".repeat(40),
    package: "@other/ui",
    packageVersion: "3.0.0",
    baselineDigest: `sha256:${"5".repeat(64)}`,
    candidateDigest: `sha256:${"6".repeat(64)}`,
    inputDigest: `sha256:${"7".repeat(64)}`,
    releasePolicyId: "other",
    releasePolicyDigest: `sha256:${"8".repeat(64)}`,
    authorizationPolicyId: "other",
    authorizationPolicyDigest: `sha256:${"9".repeat(64)}`,
    candidateCreatedAt: "2026-10-27T10:01:00.000Z",
    distributedChange: false,
    major: false,
  };
  for (const [name, value] of Object.entries(changes))
    test(`rejects altered ${name}`, () => {
      const f = fixtureAttestations();
      Object.assign(f.input.scope, { [name]: value });
      expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
    });
  for (const [name, change] of Object.entries({
    "missing checkpoint": (f: ReturnType<typeof fixtureAttestations>) => {
      Object.assign(f.input, { checkpoint: null });
    },
    "rolled-back checkpoint": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.checkpoint.revision++;
    },
    "wrong checkpoint digest": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.checkpoint.policyDigest = `sha256:${"f".repeat(64)}`;
    },
    "stale checkpoint": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.checkpoint.observedAt = "2026-10-26T11:59:59.999Z";
    },
    "expired checkpoint": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.checkpoint.expiresAt = f.input.at;
    },
    "policy bytes changed": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.policyBytes = Buffer.from("{}");
    },
    "candidate too old": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.scope.candidateCreatedAt = "2026-10-26T11:59:59.999Z";
      f.input.envelopes = [f.envelope()];
    },
    "future candidate": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.scope.candidateCreatedAt = "2026-10-27T12:00:00.001Z";
      f.input.envelopes = [f.envelope()];
    },
    "future issuance": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.envelopes = [f.envelope(0, { issuedAt: "2026-10-27T12:00:00.001Z" })];
    },
    "issuance before candidate": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.envelopes = [f.envelope(0, { issuedAt: "2026-10-27T09:59:59.999Z" })];
    },
    "expiration at clock": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.envelopes = [f.envelope(0, { expiresAt: f.input.at })];
    },
    "excessive lifetime": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.envelopes = [f.envelope(0, { expiresAt: "2026-10-28T11:00:00.001Z" })];
    },
    "forged actor": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.envelopes = [f.envelope(0, { actorId: 999 })];
    },
    "duplicate signer": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.envelopes = [f.envelope(), f.envelope(0, { reviewId: 999 })];
    },
    "duplicate review": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.envelopes = [f.envelope(), f.envelope(1, { reviewId: 301 })];
    },
    "revoked signer": (f: ReturnType<typeof fixtureAttestations>) => {
      f.policy.assignments[0]!.status = "revoked";
      f.refreshPolicy();
      f.input.envelopes = [f.envelope()];
    },
    "unknown signer": (f: ReturnType<typeof fixtureAttestations>) => {
      f.policy.assignments[0]!.status = "unknown";
      f.refreshPolicy();
      f.input.envelopes = [f.envelope()];
    },
    "missing role": (f: ReturnType<typeof fixtureAttestations>) => {
      f.policy.assignments[0]!.roles = ["design-system-owner"];
      f.refreshPolicy();
      f.input.envelopes = [f.envelope()];
    },
    "duplicate actor mapping": (f: ReturnType<typeof fixtureAttestations>) => {
      f.policy.assignments[1]!.actorId = 201;
      f.refreshPolicy();
      f.input.envelopes = [f.envelope()];
    },
    "duplicate key mapping": (f: ReturnType<typeof fixtureAttestations>) => {
      f.policy.assignments[1]!.keyId = f.policy.assignments[0]!.keyId;
      f.refreshPolicy();
      f.input.envelopes = [f.envelope()];
    },
    "excess envelopes": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.envelopes = Array(9).fill(f.envelope());
    },
    "oversize envelope": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.envelopes = [Buffer.alloc(65_537)];
    },
    "invalid UTF-8 policy": (f: ReturnType<typeof fixtureAttestations>) => {
      f.input.policyBytes = Buffer.from([0xff]);
    },
  }))
    test(`rejects ${name}`, () => {
      const f = fixtureAttestations();
      change(f);
      expect(verifyFixtureAttestations(f.input)).toEqual({
        schemaVersion: 1,
        assurance: "fixture-only",
        status: "insufficient_evidence",
        reasons: ["invalid_evidence"],
      });
    });
  test("rejects tampered signature and unsigned key ID spoofing", () => {
    const f = fixtureAttestations();
    const envelope = JSON.parse(Buffer.from(f.input.envelopes[0]!).toString());
    envelope.signatures[0].keyid = f.assignments[1]!.keyId;
    f.input.envelopes = [f.bytes(envelope)];
    expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
  });
  test("accepts URL-safe base64 for payload and signature", () => {
    const f = fixtureAttestations();
    const envelope = JSON.parse(Buffer.from(f.input.envelopes[0]!).toString());
    envelope.payload = Buffer.from(envelope.payload, "base64").toString("base64url");
    envelope.signatures[0].sig = Buffer.from(envelope.signatures[0].sig, "base64").toString(
      "base64url",
    );
    f.input.envelopes = [f.bytes(envelope)];
    expect(verifyFixtureAttestations(f.input).status).toBe("matched");
  });
});

describe("wire and signature boundaries", () => {
  function mutateEnvelope(change: (value: any) => void) {
    const f = fixtureAttestations();
    const value = JSON.parse(Buffer.from(f.input.envelopes[0]!).toString());
    change(value);
    f.input.envelopes = [f.bytes(value)];
    return verifyFixtureAttestations(f.input).status;
  }
  test("rejects altered signed payload bytes", () => {
    expect(
      mutateEnvelope((v) => {
        const p = Buffer.from(v.payload, "base64");
        p[p.length - 2] = p[p.length - 2]! ^ 1;
        v.payload = p.toString("base64");
      }),
    ).toBe("insufficient_evidence");
  });
  test("rejects altered type and unsigned algorithm claims", () => {
    expect(
      mutateEnvelope((v) => {
        v.payloadType = "other";
      }),
    ).toBe("insufficient_evidence");
    expect(
      mutateEnvelope((v) => {
        v.signatures[0].algorithm = "ed25519";
      }),
    ).toBe("insufficient_evidence");
  });
  test("rejects multiple signatures and noncanonical encodings", () => {
    expect(
      mutateEnvelope((v) => {
        v.signatures.push(v.signatures[0]);
      }),
    ).toBe("insufficient_evidence");
    expect(
      mutateEnvelope((v) => {
        v.payload += "!";
      }),
    ).toBe("insufficient_evidence");
    expect(
      mutateEnvelope((v) => {
        v.signatures[0].sig = "A";
      }),
    ).toBe("insufficient_evidence");
  });
  test("rejects duplicate keys and malformed UTF-8 in an envelope", () => {
    const f = fixtureAttestations();
    const original = Buffer.from(f.input.envelopes[0]!).toString();
    f.input.envelopes = [
      Buffer.from(original.replace('{"payloadType":', '{"payloadType":"bad","payloadType":')),
    ];
    expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
    f.input.envelopes = [Buffer.from([0xff])];
    expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
  });
  test("rejects duplicate policy JSON keys even when its digest and checkpoint match", () => {
    const f = fixtureAttestations();
    f.input.policyBytes = Buffer.from(
      Buffer.from(f.input.policyBytes)
        .toString()
        .replace('{"schemaVersion":1', '{"schemaVersion":1,"schemaVersion":1'),
    );
    f.input.scope.authorizationPolicyDigest = hash(f.input.policyBytes);
    f.input.checkpoint.policyDigest = hash(f.input.policyBytes);
    f.input.envelopes = [f.envelope()];
    expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
  });
  test("rejects signed subject substitution and unknown statement fields", () => {
    const f = fixtureAttestations();
    const wire = JSON.parse(Buffer.from(f.envelope()).toString());
    const statement = JSON.parse(Buffer.from(wire.payload, "base64").toString());
    statement.subject[0].digest.sha256 = "f".repeat(64);
    f.input.envelopes = [f.signStatement(statement)];
    expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
    statement.subject[0].digest.sha256 = f.input.scope.candidateDigest.slice(7);
    statement.predicate.roles = ["api-owner"];
    f.input.envelopes = [f.signStatement(statement)];
    expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
  });
  test("rejects a key with noncanonical SPKI or a mismatched fingerprint", () => {
    const f = fixtureAttestations();
    f.policy.assignments[0]!.keyId = `sha256:${"f".repeat(64)}`;
    f.refreshPolicy();
    f.input.envelopes = [f.envelope()];
    expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
  });
});

test("copies actual byte view rather than a caller-controlled iterator", () => {
  const f = fixtureAttestations();
  const valid = f.input.policyBytes;
  class ForgedBytes extends Uint8Array {
    override [Symbol.iterator](): ReturnType<Uint8Array[typeof Symbol.iterator]> {
      return valid.values();
    }
  }
  Object.assign(f.input, { policyBytes: new ForgedBytes([123, 125]) });
  expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
});

test("copies actual envelope elements rather than a caller-controlled map", () => {
  const f = fixtureAttestations();
  const valid = f.input.envelopes[0]!;
  const forged = [Buffer.from("{}")];
  forged.map = (() => [valid]) as typeof forged.map;
  f.input.envelopes = forged;
  expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
});

test("rejects signers without a role required for this scope", () => {
  const f = fixtureAttestations();
  f.policy.assignments[1]!.roles = [];
  f.refreshPolicy();
  f.input.envelopes = [f.envelope(0), f.envelope(1)];
  expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
  const g = fixtureAttestations();
  g.input.scope.major = false;
  g.policy.assignments[1]!.roles = ["api-owner"];
  g.refreshPolicy();
  g.input.envelopes = [g.envelope(0), g.envelope(1)];
  expect(verifyFixtureAttestations(g.input).status).toBe("insufficient_evidence");
});

test("rejects inherited fields and disguised extra own keys", () => {
  const f = fixtureAttestations();
  const inherited = Object.create(f.input);
  inherited["at,checkpoint,envelopes,policyBytes,schemaVersion,scope"] = 1;
  expect(verifyFixtureAttestations(inherited).status).toBe("insufficient_evidence");
  const g = fixtureAttestations();
  Object.defineProperty(g.input, "secret", { value: 1, enumerable: false });
  expect(verifyFixtureAttestations(g.input).status).toBe("insufficient_evidence");
  const h = fixtureAttestations();
  Object.defineProperty(h.input.scope, "secret", { value: 1, enumerable: false });
  expect(verifyFixtureAttestations(h.input).status).toBe("insufficient_evidence");
  const i = fixtureAttestations();
  Object.assign(i.input.checkpoint, { [Symbol("extra")]: 1 });
  expect(verifyFixtureAttestations(i.input).status).toBe("insufficient_evidence");
});

test("does not execute getters in injected structural fields", () => {
  const f = fixtureAttestations();
  let called = false;
  Object.defineProperty(f.input.scope.repository, "host", {
    enumerable: true,
    get() {
      called = true;
      return "github.com";
    },
  });
  expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
  expect(called).toBe(false);
});

test("rejects independently signed malformed and ambiguous payload bytes", () => {
  const f = fixtureAttestations();
  const wire = JSON.parse(Buffer.from(f.envelope()).toString());
  const payload = Buffer.from(wire.payload, "base64").toString();
  const cases = [
    Buffer.from(payload.replace('"reviewId":301', '"reviewId":301,"reviewId":301')),
    Buffer.from(payload.replace('"reviewId":301', '"reviewId":9007199254740993')),
    Buffer.concat([Buffer.from(payload.slice(0, -1)), Buffer.from([0xff]), Buffer.from("}")]),
  ];
  for (const malformed of cases) {
    f.input.envelopes = [f.signPayload(malformed)];
    expect(verifyFixtureAttestations(f.input).status).toBe("insufficient_evidence");
  }
});
