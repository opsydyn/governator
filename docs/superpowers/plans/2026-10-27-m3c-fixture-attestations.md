# M3c Fixture Attestations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Verify fixture-signed statements over an exact candidate scope while preserving the normal release gate's insufficient-evidence result.

**Architecture:** A private offline package validates bounded DSSE envelopes and in-toto statements with injected expected scope, policy bytes, synthetic freshness checkpoint and clock. Results establish only cryptographic/fixture-policy matches, never real human or GitHub authority. Actual release and MCP paths remain disconnected.

**Tech Stack:** Bun 1.4.2, TypeScript, Moon, Effect Schema, tsdown, Vitest, oxlint/oxfmt; Node-compatible `node:crypto` Ed25519 verification.

**Spec:** `docs/superpowers/specs/2026-10-27-m3c-artifact-attestation-design.md` (approved by user, owner-managed policy selected).

## Global constraints

- All verification offline: no default network, credential discovery, trust lookup, real keys, enrollment, signing service, release/MCP approval connection, push or publish. Test keys are disposable.
- Bound and strictly validate all externally provided bytes/structures, reject duplicate JSON keys and unsafe numeric IDs before rounding, use fixed sanitized outcomes; no partial matched output.
- DSSE signature is Ed25519 over PAE of exact copied decoded payload bytes and expected payload type; verify before payload parsing. Accept standard and URL-safe base64. Unauthenticated key ID only narrows candidate keys, never establishes authority.
- Profile: payload type `application/vnd.in-toto+json`; statement type `https://in-toto.io/Statement/v1`; predicate type `https://governanator.dev/attestation/reviewer-approval/v1`; one signature per envelope; bounded set of envelopes; Ed25519 public keys represented by canonical DER SubjectPublicKeyInfo base64 and identified by `sha256:` plus SHA-256 of DER. Algorithm comes only from verifier profile.
- Hash exact copied UTF-8 policy bytes by SHA-256 against separately supplied expected authorization-policy digest; parse those exact same bytes only after bound/strict JSON checks. Fixture policy and synthetic checkpoint are independently supplied, not trusted authority. Missing or stale checkpoint yields insufficient/unknown, never current production authorization.
- Bind exact repository provider, host and stable numeric ID, PR, source commit, package/version, candidate creation time, baseline/candidate/input digests, release-policy and authorization-policy IDs/digests; expected candidate digest is comparison input only, not proof of reading the archive. In-toto subject `digest.sha256` is bare lowercase hex, converted explicitly to/from project `sha256:` representation.
- Require candidate age <=24h; issued >= candidate time and <= injected clock; expiration > clock and issuance; lifespan <=24h. One signer may cover both roles; separate signers can cover roles with exact same scope. Reject duplicate signer or review IDs and unknown/revoked/wrong-role keys.
- No production freshness, identity, authority, human intent, trusted time or durable one-use replay claim; same-scope recheck is idempotent. Existing archive check rehashes before and after.

## Review focus

- Duplicate JSON properties, unsafe numbers and malformed UTF-8 in envelope, policy or payload fail closed.
- Key ID spoofing, forged signer identity/roles, mixed base64 and ambiguous key mappings cannot select authority.
- Altered PAE bytes/payload type, archive digest, policy bytes and every expected scope field fail closed.
- Revoked/rotated keys, stale/rolled-back or absent synthetic checkpoint and invalid time windows cannot produce a match.
- Mutated candidate, copied/forged fixture result and saved MCP snapshot never authorize a normal release.

## Task 1 — Offline verifier and private package

**Files:** Create `packages/fixture-attestation/{package.json,moon.yml,tsdown.config.ts,README.md,LICENSE,src/*.ts}` and `tests/fixture-attestation.test.ts` / test fixture helpers. Update workspace package aliases, TypeScript, Moon, root build, lockfile and narrow lint/boundary config.

**Interface:** Export `verifyFixtureAttestations(input: unknown): FixtureAttestationResult` and types from package index. Input includes raw envelope bytes, separately supplied expected scope, exact policy UTF-8 bytes, injected evaluation time and independently supplied synthetic checkpoint/freshness fixture; output is fixed, schema-versioned, `assurance: "fixture-only"`, with `matched` or `insufficient_evidence` and bounded non-sensitive reason codes. Document exact input shapes and limits in the package README; never return signing material, arbitrary exception text, or a capability. Expose constants for profile types as needed by fixtures. No filesystem or network reads.

- [ ] Write failing tests for a single signer covering both roles, two signers covering separate roles, wrong exact candidate digest and the DSSE PAE published known-answer byte vector. Run and record RED before implementation.
- [ ] Implement the verifier, strict bounded JSON and base64/DER handling, policy/checkpoint/time/role validation and fixed outcomes. Include adversarial tests for every global constraint and Review focus. Run focused tests GREEN; verify TypeScript, lint and package build. Commit.
- [ ] Obtain independent task review for spec and security. Fix Important findings with regression tests and scoped re-review.

## Task 2 — Isolation and documentation

**Files:** `tests/mcp-fixture-attestation-isolation.test.ts`, `docs/m3c-verification.md`, package README/root README, `.changeset/m3c-fixture-attestations.md`, `governance/release.json` and any narrowly required static boundary checker.

**Interface:** Consume the actual task-1 fixture verifier and existing `checkCandidate`, snapshot and MCP SDK test helpers. Changeset is private/nonpublishing metadata only.

- [ ] Add real-candidate integration test using actual matched verifier output and forged trusted fields; assert ordinary release remains insufficient and saved MCP report remains unverified. Recheck altered candidate tarball and assert digest failure. Test against production code, not a mock of the release decision.
- [ ] Add static import/ambient-capability isolation assertions. Document actual proof and remaining trust gaps. Run focused tests, full workspace checks and builds; commit locally.
- [ ] Obtain independent task review; fix Important findings with regression tests and scoped re-review.

## Task 3 — Final review and main integration

- [ ] Run complete local checks/builds and release demo; independently review the whole branch, including dependency and trust boundaries. Address Important findings.
- [ ] Fast-forward local main, run checks/builds, refresh source-bound dogfood and Storybook, export snapshot and run built MCP SDK smoke. Record exact results.
- [ ] Recommend the next bounded operational design for independently protected repository-owner policy and authenticated GitHub identity. Do not activate it.
