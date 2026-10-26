# Governance model

The registry defines stable component IDs. A source move or story rename does not change identity. Source/story paths must remain inside the chosen repository after realpath resolution, with symlinked inputs rejected for M0. Multiple stories may point at one component; a story cannot belong to two component identities. Replacement IDs must exist and cannot form cycles. Deprecated records require a replacement.

Registry, policy, evidence, waiver, contract, change and release-manifest shapes have strict Effect Schema decoding. Unknown fields, unsupported schema versions, invalid IDs/SemVer and malformed/noncanonical UTC timestamps are rejected. Timestamps use `YYYY-MM-DDTHH:mm:ss.sssZ`. Policy durations must be finite and positive.

## Decisions

Lifecycle is a declaration in a version-controlled registry. A gate evaluates a proposed target; it does not update that registry or grant an approval. The policy's transition table controls allowed moves. Deprecated and retired components are blocked for new adoption; the core's `useCase` argument distinguishes this from existing use. M0's CLI evaluates promotion only.

For each required check, the evaluator filters evidence by component, repository, SHA, accepted producer, provenance, time and optional candidate-artifact digest. Unaccepted records cannot satisfy or falsely fail a trusted check. Fresh accepted failures take precedence over conflicting passes. An active permitted trusted waiver can waive a failure or missing check. Expired, future-issued, overlong, prohibited or unverified waivers cannot pass.

Freshness is inclusive at the maximum age; expiry is exclusive (`expiresAt <= evaluatedAt` is expired). Future observations cannot count. Rejected/mismatched proof yields `missing`; matching but old proof yields `expired`; neither equals a known `failed` result. Evidence/waiver IDs must be unique. Output order is deterministic.

An established failure or forbidden transition yields `blocked`, even if another check lacks proof. Missing proof without an established blocker yields `insufficient_evidence`. Only satisfied configured requirements yield `ready`. A missing target policy never passes. Every policy change, including apparent strengthening, is conservatively protected by `comparePolicy`; an independent host-supplied owner attestation is required. M0 does not verify GitHub identities.

## Trust modes

- `demo` accepts only records explicitly labelled `demo`. Every resulting report is labelled `demo` and must not be used as real CI/release proof.
- Normal evaluation accepts only `adapter` records whose full canonical content digest matches an independently supplied host attestation map. Files cannot supply this map, and the CLI exposes no flag for it. M0 provides this typed integration boundary and unit tests, not a working external verifier.
- A normal report says `unverified` unless every component is ready with at least one verified requirement. `verified-inputs` describes configured requirement provenance; it never means universal safety, human approval, publication or deployment.

## Versions and baselines

Component `contractVersion` is audit metadata. `packageVersion` is the actual installable unit; components in one shared package cannot be pinned independently. The package's required bump is the maximum across classified component/export/token changes. Unknown compatibility remains unknown. Stable eligibility excludes prerelease and 0.x contracts; supporting weaker release channels is future work.

M0 version checks operate on explicit classification and verified-major-requirements inputs. No static analyzer or actual release approval verifier is implemented. Contract and release-manifest schemas preserve independent versions/digests for M1. Local baseline fixtures are keyed by exact package/version and checked against a canonical SHA-256 digest. A fixture is not a published artifact, and changing both the fixture and adjacent digest requires review rather than being cryptographically prevented.

Known minor: the private `assessVersion` helper uses npm semver parsing and accepts prefixed/whitespace versions such as `v1.0.0`; registry/contract input schemas require canonical versions. Normalize this exported helper boundary in a follow-up.
