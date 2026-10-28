# Governator 0.1.0 release preparation plan

**Status:** Proposed local preparation plan. Package selection is approved; implementation, remote setup and publication are separate decisions. Baseline: local `main` at `95a298c` on 28 October 2026.

**Goal:** Prepare `@governator/storybook-addon`, `@governator/cli` and `@governator/mcp` for a first 0.1.0 release, with verifiable consumer packages and an explicitly approved publishing path. All other workspace packages and the demo remain private.

**Tooling and boundaries:** Bun, Moon, tsdown and Changesets. Follow the Changesets/action and npm provenance approach used by the local `opsydyn/oxlint-effect` reference, subject to resolving the artifact-custody question below. Effect and other private workspace internals must not become unexpected consumer peer dependencies. The intended repository URL is `https://github.com/opsydyn/governator`; repository access and npm scope ownership have not been verified. Human validation remains deferred.

## Release design and decisions

The workspace manifests currently declare 0.1.0 but are private. Pending changesets instead propose 0.2.0 for Governator packages, and include a deliberately incorrect demo change. `governance/release.json` enumerates these inputs and the release-input validator requires it to enumerate every pending `.changeset/*.md`. They therefore cannot simply be deleted or relocated without maintaining the dogfood scenario and its validation.

Recommended approach: retain 0.1.0, preserve the existing changesets and blocked demo case in a dedicated fixture workspace or equivalent isolated test setup, and make the real release workspace's active changesets reflect only real future release intent. Preserve the production invariant that configuration enumerates every active changeset; do not weaken it to accommodate fixtures. Record first-release notes explicitly. Verify that the actual Changesets workflow can publish existing, unpublished 0.1.0 versions without an accidental 0.2.0 bump in an isolated rehearsal. If it cannot, reassess the alternative of starting from 0.0.0 with curated minor changesets, including its effects on existing evidence and references, before choosing it.

The reference repository uses Changesets/action, `changeset publish`, an npm token and npm provenance. The installed Changesets CLI publishes a package directory, allowing npm to repack it and run lifecycle hooks. A previously inspected tarball is therefore not automatically proven to be the exact bytes uploaded. Investigate and demonstrate whether the reference-style path can preserve the approved artifact through publication; do not claim byte-for-byte enforcement from a local hash alone. If it cannot, present the tradeoff between the requested publishing method and exact archive custody for a separate user decision. Leave release automation disabled until that is resolved and explicitly approved.

The `@governator` npm scope, package-name availability, repository identity, trusted owners, credentials and provenance configuration are unverified. The demo's blocked release report exercises its intentionally wrong bump; it is not an assessment of the Governator packages' own release. Owner policy changes require two independent owner approvals; define and verify the bootstrap and ordinary release approval procedures separately rather than treating those requirements as interchangeable.

## Review focus

- The real workspace has no accidental 0.2.0 release intent, while the isolated fixture still demonstrates that an invalid breaking-change patch is blocked.
- Only the three chosen packages are publishable, with correct 0.1.0 manifests, license files, repository metadata, entry points and consumer dependencies.
- Fresh artifacts built from the final candidate work in independent consumers, and their source, toolchain and SHA-256 hashes are recorded.
- A no-credentials rehearsal exercises the real Changesets selection and publishing boundary, including `prepack`, and exposes any repacking or byte-custody gap.
- Local results, later hosted evidence, registry publication and deferred human acceptance remain distinct claims.

## Task 1: Isolate release fixtures and reconcile versions

**Likely files:** `.changeset/`, `governance/release.json`, `packages/query/src/release-inputs.ts`, the release-input and dogfood tests, and fixture documentation. Identify every reference before moving anything.

1. Capture the existing changeset intent and fixture behavior. Create an isolated fixture workspace or another explicit fixture boundary that keeps its own release configuration and changesets, including the intentionally invalid demo change.
2. Update fixture paths, setup and tests. Keep the real workspace's enumeration and tracked-input checks strict; retain a test that catches an unlisted or altered active changeset.
3. Establish the initial 0.1.0 release notes and real pending-intent policy without inventing a new bump. Run Changesets status in an isolated copy and record its actual exit status and package results. Verify that the planned publishing workflow selects the three unpublished 0.1.0 packages without versioning them to 0.2.0; use a disposable fake registry/publisher or equivalent isolated simulation, with no public registry writes.
4. Run the relevant versioning, query and CLI tests and the dogfood release-plan checks. Confirm the blocked fixture still blocks for the intended reason.

**Acceptance:** fixture behavior and strict real-input validation both pass; Changesets results and the initial-release mechanism are demonstrated, not assumed. Stop and revise the design if they conflict.

## Task 2: Prepare public package boundaries

**Likely files:** the three selected package manifests, their LICENSE and README files, root Changesets configuration, packaging scripts and relevant documentation.

1. Audit all manifests and transitive bundled dependencies. Set publication eligibility only for the selected packages during an approved local implementation; keep other packages private. Confirm that Changesets' private-package versioning configuration does not accidentally include private packages in publication.
2. Add accurate repository, issue, homepage, license and public-access/provenance metadata as supported by the selected package flow. Verify executable and export targets, Bun and Storybook compatibility, and the absence of unexpected consumer peers. Treat npm scope and package availability as unverified until checked later.
3. Build and pack locally, inspect each archive's files and metadata, and run `publint` and applicable boundary checks. Do not activate the disabled release workflow or the fail-closed release script in this slice.

**Acceptance:** only the approved packages are publication candidates, archive contents and consumer-facing metadata are correct, and there are no private workspace imports that fail outside the repository.

## Task 3: Requalify the final candidate

**Likely files:** `docs/qualification/consumer-distribution-verification.md`, `docs/qualification/storybook-governance-editor-verification.md`, consumer test fixtures and scripts as needed.

1. From a clean candidate, record its commit, tool versions and package hashes. Rebuild each selected artifact and verify its contents, licenses and dependency surface.
2. Exercise the addon in independent npm and strict-peer pnpm Storybook consumers, covering static build and local authoring/editor persistence. Exercise CLI and MCP through their documented independent consumer entry points. Record cache or offline reconstruction limitations and distinguish machine checks from human acceptance.
3. Run the applicable repository build, typecheck, lint, format, test, boundary, docs and Storybook checks. Capture results against that same candidate; investigate failures rather than reusing earlier results.

**Acceptance:** all selected packages pass relevant clean-consumer and repository checks with reproducible evidence. Earlier qualification is context, not proof for the new candidate.

## Task 4: Prove the publishing boundary locally

**Likely files:** an isolated rehearsal harness, `.github/workflows/release.yml`, release scripts and qualification documentation. Inspect the installed Changesets/action and CLI behavior rather than assuming that a tarball argument is supported.

1. Rehearse the reference-style Changesets selection and publication with a disposable package fixture, injected fake publisher or isolated registry, and no real credentials or public registry access. Trace package directory selection, lifecycle hooks, actual transmitted artifacts and their hashes.
2. Specify a fail-closed check for the candidate identity, the package/version set and artifact integrity at the point of use. Test mutation and mismatched-artifact cases. Establish whether the exact approved bytes can reach npm through the requested method; document limitations and any unproven assumptions.
3. If exact custody cannot be demonstrated, stop with the competing options and their consequences for explicit user selection. Do not quietly replace Changesets publishing or weaken the requirement.

**Acceptance:** a reviewable local rehearsal proves the selected method and its guarantees, or records the unresolved decision. The repository remains unable to publish until separately authorized.

## Task 5: Consolidate local evidence

Update release and user documentation to match verified behavior and the chosen package surface. Review the changes, run the necessary checks, commit the approved local implementation and integrate it onto local `main`. Preserve the disabled release guard until a later approved activation. Recommend the next bounded step with any outstanding decisions.

## Later gates requiring separate authorization

1. Verify the GitHub repository's identity, access and protections; npm scope ownership and names; package settings; token custody; and provenance support. Read-only verification, configuration changes, pushes and publication are distinct actions.
2. Establish the repository-owner-managed reviewer policy and its bootstrap, including two independent owners for policy changes, and qualify any hosted integration against the actual repository. Do not substitute synthetic evidence for authenticated hosted evidence.
3. Once the exact final candidate, publication mechanism and hosted prerequisites are approved, separately authorize remote setup/push and then the actual npm publication. Verify published package versions and provenance afterward. Human UX and accessibility acceptance remains deferred until explicitly scheduled.
