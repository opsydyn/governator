# Exact-tarball publisher design

**Status:** Proposed design for review; no publisher, trusted approval, workflow activation or npm publication is authorized by this document. The first release targets `@governator/storybook-addon`, `@governator/cli` and `@governator/mcp` at `0.1.0`. Follow-on releases may use a different explicitly approved set.

## Problem and chosen direction

Governator checks exact candidate artifacts, but the reference `changesets publish` flow gives npm a directory. The [local custody rehearsal](../../qualification/0-1-candidate-and-custody.md) demonstrated that a later `prepack` can change the uploaded archive after an earlier archive was reviewed. The owner chose to preserve the reviewed archive bytes and adapt publishing.

Keep Changesets for release intent and version preparation. A separate, guarded publishing adapter will consume the already-approved `.tgz` artifacts and invoke npm with archive inputs. This is a proposed integration with `changesets/action@v1`, not a claim that the action recognizes a custom publisher's outcomes correctly. npm documents tarball publishing, while the fake-registry rehearsal showed matching uploaded bytes for one controlled fixture. See [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/) and [Changesets action v1](https://github.com/changesets/action/blob/v1/README.md).

## Authority and candidate identity

A release candidate comprises the exact source commit, trusted repository identity, pinned build/toolchain identity, intended registry and tag, and a unique set of package names, versions, archive sizes and SHA-256 digests. The candidate record references qualification and authenticated approval evidence; it is not itself proof of approval. The Git commit used to build and approve the archives must be the release commit. Committing a new qualification document afterward changes HEAD and does not magically transfer approval to that new commit.

The adapter accepts only a supported schema and an authenticated, currently valid approval for that exact candidate under the repository owner's policy. Missing trust roots, expired or revoked approvals, unknown repository/registry identity, dirty or mismatched source, duplicate or unexpected packages, version mismatch, unsafe paths or different bytes fail closed before a write. Changes to the reviewer policy require two independent owners, as previously selected; the bootstrap and ordinary release approval rules must be defined and verified separately. Existing simulated review objects and local snapshots are not authority.

For the first release, explicitly require the three chosen packages at `0.1.0`, and exclude all private workspaces. On later releases the approved candidate set, not a hard-coded permanent three-package list, determines what may publish. Refuse mutable tags, unknown provenance claims and unverified package ownership; do not infer npm scope control from the GitHub organization.

## Custody and execution boundary

1. Build each archive once from the clean release commit in a qualified environment. Inspect its internal manifest and file list, dependencies, licenses and executable entry points; run relevant consumer tests against that archive. Compute SHA-256 and SHA-512 on the same bytes and record their sizes and build evidence.
2. Obtain approval against the resulting candidate record. Transfer the archives and their signed or otherwise authenticated binding to the publishing environment. Verify approval, origin, exact package set, internal metadata and hashes after transfer. Approval and custody mechanisms remain design dependencies, not implemented capabilities.
3. Place verified archives in a custody boundary protected from the publisher and all untrusted writers, and give the npm process only read access. A candidate design is a separately owned, read-only mounted artifact directory with an unprivileged publisher process and a narrowly trusted controller. This is conditional: the Linux hosted runner, mount ownership, namespace isolation, inherited file descriptors and relevant attacker capabilities must be demonstrated. A simple chmod, same-user lock, or preflight hash alone is insufficient.
4. Invoke npm on each protected archive with lifecycle scripts disabled, subject to proving the selected npm version's actual behavior. Verify that npm reads and transmits the approved bytes, including under attempted path replacement and concurrent mutation. Check package identity and registry destination at point of use. If immutable custody cannot be demonstrated with npm's path-based interface, stop and assess a separately trusted upload boundary; do not silently weaken byte identity or claim a proxy preserves npm provenance without testing it.
5. Record each real outcome and verify registry metadata and downloaded archive integrity before declaring that package published. A successful local fake-registry response or an authenticated provenance statement is not by itself proof that the registry serves the expected bytes. Compare registry integrity using the supported digest algorithms and preserve evidence of exactly what was checked.

This protects against an untrusted process able to edit build output or swap files after approval, within the stated isolation boundary. It does not protect against a compromised trusted controller, runner kernel, registry or npm publisher identity. These assumptions and recovery procedures need explicit operational review.

## Coordination, failures and evidence

The proposed adapter receives an exact approved package set and publishes in a deterministic order. A preflight confirms the registry state, but it is not atomic with publication. If a name/version is already present, compare its independently fetched integrity and provenance with the approved candidate; never overwrite or assume an existing version matches. Missing, mismatched or unverifiable evidence stops the release.

Package publication is not an atomic multi-package transaction. After a failure, record confirmed successes, failures and unknown outcomes independently. A retry must recheck registry state and candidate authority; it must not claim failure means no upload occurred or retry a conflicting version. Create or push tags and report action outputs only after their corresponding outcomes are verified; partial release is surfaced explicitly. Do not forge Changesets CLI output to make a custom publisher look successful.

`changesets/action@v1` exposes `published` and `publishedPackages`, and its source attempts the configured publish command when no changesets remain. Qualify how this exact v1 action detects results, produces outputs, creates tags and handles partial failure with the custom command before relying on any of those behaviors. Pin the action and tools to independently verified identities at activation time. Changesets' own versioning/tag conventions, initial unpublished 0.1.0 behavior and multiple-package release handling require explicit tests. [Action v1 source](https://github.com/changesets/action/blob/v1/src/index.ts)

npm provenance requires qualified hosted CI and matching repository identity; its attestation links an artifact to source and build information but is not a safety or human-approval verdict. Whether the chosen custody arrangement works with npm provenance and the exact GitHub Actions identity must be demonstrated in a separately authorized hosted qualification. The current reference uses a token and OIDC for provenance; switching to npm trusted publishing is a separate design and authorization decision. [npm provenance](https://docs.npmjs.com/generating-provenance-statements/)

## Local implementation plan after approval

1. Define a versioned candidate envelope and strict validation for repository/commit, exact package set, hashes, sizes, registry/tag and approval references. Unit tests reject altered commit, package name/version, digest/size, duplicate/missing/extra entries, unsafe paths and untrusted or expired evidence. Keep authorization fail-closed until a real trust adapter is qualified.
2. Create a **non-publishing rehearsal adapter** with an injected fake registry and dummy credentials, initially offline. Test directory repacking versus tarball transfer, script suppression, package identity, approved bytes, file replacement/concurrent mutation and point-of-use isolation. Prove that failures cause no fake upload; preserve observable unknown states for interrupted requests. No real registry or publication capability in this slice.
3. Test multi-package partial success, uncertain responses, identical versus conflicting existing versions, retries and readback. Verify action-v1 command/output and tag behavior in a disposable local harness; treat hosted behavior as unverified until independently tested.
4. Review the trust and custody design against the actual runner and owner policy. Record verified assumptions and unresolved limitations. Keep `scripts/publish-disabled.ts` and the disabled workflow unchanged until separate authorization for activation and publication.

## Acceptance for this design stage

A reviewer can identify the exact trusted inputs, where the bytes are protected, what stops a release, how a partial release is recovered, and which claims still require hosted evidence. No actual publisher, GitHub settings, npm scope, release tags or registry state is changed by this design.
