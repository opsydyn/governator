# Fixture attestation verifier

Private, offline fixture experiment. `verifyFixtureAttestations(input: unknown)` returns only `{ schemaVersion: 1, assurance: "fixture-only", status: "matched" | "insufficient_evidence", reasons: [] | ["invalid_evidence"] }`. It is not release authorization, a capability, an authenticated GitHub review, proof of human intent, current revocation, trusted time, or a durable replay store. There are no filesystem or network reads. The caller must independently hash the candidate archive; the supplied candidate digest is only a comparison input. Rechecks of the same scope are idempotent.

## Input

All objects have exactly the fields shown; extra or missing fields fail closed. All input is supplied by the caller. Bytes must be `Uint8Array` (not backed by `SharedArrayBuffer`) and are copied. Each envelope and the policy is limited to 65,536 bytes; at most eight envelopes; decoded payload is limited to 32,768 bytes. JSON is UTF-8, depth at most 32, with no duplicate decoded object keys and only safe integer number lexemes. IDs and policy revisions are positive safe integers. Text fields are nonempty and at most 256 characters. Timestamps use canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`.

```ts
{
  schemaVersion: 1,
  envelopes: Uint8Array[], // one DSSE signature per envelope
  scope: {
    repository: { provider: "github", host: "github.com", id: 101 },
    pullRequest: 17, commit: "<40 lowercase hex characters>",
    package: "@example/ui", packageVersion: "2.0.0",
    baselineDigest: "sha256:<64 lowercase hex characters>",
    candidateDigest: "sha256:<64 lowercase hex characters>",
    inputDigest: "sha256:<64 lowercase hex characters>",
    releasePolicyId: "release-v1", releasePolicyDigest: "sha256:<64 lowercase hex characters>",
    authorizationPolicyId: "owners-v1", authorizationPolicyDigest: "sha256:<64 lowercase hex characters>",
    candidateCreatedAt: "2026-10-27T10:00:00.000Z", distributedChange: true, major: true
  },
  policyBytes: Uint8Array, // exact UTF-8 JSON bytes hashed against authorizationPolicyDigest
  at: "2026-10-27T12:00:00.000Z", // injected clock
  checkpoint: {
    policyId: "owners-v1", revision: 2, policyDigest: "sha256:<64 lowercase hex characters>",
    observedAt: "2026-10-27T11:00:00.000Z", expiresAt: "2026-10-28T09:00:00.000Z"
  }
}
```

Policy JSON is `{ schemaVersion: 1, id, repository, revision, observedAt, expiresAt, assignments }`. `repository` matches the scope, and `assignments` contains 1–100 unique keys and unique actor IDs. Each assignment is `{ keyId, publicKey, actorId, status, roles }`: `publicKey` is canonical standard-base64 DER SPKI for Ed25519; `keyId` is `sha256:` plus the SHA-256 of those DER bytes; `status` is `active`, `revoked`, or `unknown`; and `roles` contains unique values from `design-system-owner` and `api-owner`. The checkpoint must independently match policy ID, revision, and exact policy digest. Both policy and checkpoint must have observed times at or before the injected clock, no more than 24 hours old, and expiration after the clock with a lifespan no more than 24 hours. This injected fixture checkpoint does not establish production freshness or rollback protection.

Each JSON DSSE envelope is `{ payloadType, payload, signatures: [{ keyid, sig }] }`. Payload type is `application/vnd.in-toto+json`; payload and signature accept canonical standard or URL-safe base64, padded or unpadded, without mixing alphabets. The signature is Ed25519 over DSSE PAE of the exact decoded payload and type. `keyid` only selects a policy key; identity and roles come from the matching policy assignment.

The signed payload is an in-toto v1 statement:

```ts
{
  _type: "https://in-toto.io/Statement/v1",
  subject: [{ name: "@example/ui", digest: { sha256: "<candidate digest, bare lowercase hex>" } }],
  predicateType: "https://governanator.dev/attestation/reviewer-approval/v1",
  predicate: {
    schemaVersion: 1, purpose: "reviewer-approval", scope: /* exact scope above */,
    actorId: 201, reviewId: 301,
    issuedAt: "2026-10-27T11:00:00.000Z", expiresAt: "2026-10-28T10:00:00.000Z"
  }
}
```

The candidate is no more than 24 hours old at evaluation. Issuance must be at or after candidate creation and no later than evaluation; expiry is strictly later than issuance and evaluation, and the statement lifetime is at most 24 hours. All statements must match the full scope. Duplicate actors and review IDs fail closed, as do unknown or revoked keys and ambiguous policy mappings. A distributed change requires a design-system owner and a major change additionally requires an API owner; one active signer may cover both, or two signers may supply separate roles. Non-distributed scope returns insufficient evidence.

For tests, `tests/fixture-attestation-fixtures.ts` provides `fixtureAttestations()`: mutate `input.scope`, then set `input.envelopes = [envelope()]` to re-sign that scope using disposable in-memory test keys. `refreshPolicy()` re-encodes a changed fixture policy and updates the separately supplied expected digest and checkpoint; the caller must then re-sign. This helper is test code and is not part of the package API.
