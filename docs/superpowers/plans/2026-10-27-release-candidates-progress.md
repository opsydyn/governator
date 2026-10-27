# Release candidates execution ledger

Plan: docs/superpowers/plans/2026-10-27-release-candidates.md; base eb6434f.

- Baseline: clean source; 93/93 tests pass. Continue in existing checkout on a dedicated local branch, preserving prior branch and browser workspace.
- Pre-flight: versioning emits plain release result consumed by CLI and optional protocol field; CLI alone supplies fresh in-process test context. Archive inspection supplies actual API, manifest and file digests; saved snapshots never replace it.
- Task 1: real Changesets parser, Effect release schemas and pure gate implemented; 9 new tests RED missing module → GREEN. Existing typecheck/lint pass.
- Ruling: ordinary changed releases cannot pass trusted owner approval until an external verifier exists; demo can pass only exact-scoped, expiry-bound explicitly simulated review with migration/impact/matrix documents. Cost: local normal releases remain fail-closed, even when version bumps are sufficient.
- Task 2: actual pack/manifest/API inspection, independent payload reproduction, fresh Vitest and packed API consumer compilation; CLI integration RED unsupported command → GREEN. Actual failing tests block and changed bytes are rejected. Baseline now retains its original tarball and its decoded manifest/hash map is checked against that archive.
- Task 3: optional release summary schema and browser panel RED unknown release field → GREEN; stale/mismatched embedded release snapshot RED ready → GREEN error. Preserved official sidebar label rendering and added lifecycle/readiness markers, with unknown identities/reports remaining unverified.
- Archive regression: a private declaration could be advertised only as an export key; RED accepted → GREEN rejected. Ruling: enforce one root types entrypoint (plus optional package.json export) for this first exact-candidate analyzer — cost: multi-entrypoint packages require a later analyzer rather than partial success.
- Build correction: explicit plain parseIntent return type prevents Changesets transitive types from leaking into emitted declarations. No new public dependency added to addon.
- Local full check before last archive/browser refinements: 109/109 tests and nine Moon tasks pass. Six builds and Storybook build pass after portable types fix; standard Storybook vendor chunk warning remains. One independent whole-branch review running.
- Final independent review: no Critical, three Important, no Minor. Fixed all three with RED→GREEN regressions: mixed known-minor plus unknown changes; packed `__proto__` filenames omitted from fingerprints; stale ignored dist leaking into capture/reproduction. Candidate builds now use clean temporary clones of the exact source commit, preserving the operator checkout; temporary snapshots are removed after packing.
- Fixture correction: symlinked node_modules was accidentally tracked by directory-only ignore patterns in temporary test repositories. Fixture ignores now cover the symlink; production rejects tracked node_modules rather than copying a dependency cache into source builds.
- Final local check after fixes: all nine Moon tasks pass, 113/113 tests across 17 files. No deferred minors from this review. Existing historical minors remain separately documented in prior slice records.

- Full package simulation: patch/minor blocked; major missing scoped review insufficient; exact simulated reviewed major eligible_under_demo_policy; normal mode still insufficient; changed artifact rejected. All cases ran real React package builds, tarballs, consumer compilation and mapped UI tests.
- Integration correction: direct API roots are canonicalized (symlink/tmp alias regression RED→GREEN), and the dogfood config enumerates all three pending Changesets. Full local check now 114/114 tests; independent npm and strict-pnpm updated addon builds pass.

- Ruling: root release command now fails closed without a trusted publishing adapter; local/simulated eligibility cannot flow into the former unchecked Changesets publish command. Cost: actual publication requires separate adapter activation, while the existing disabled Changesets workflow template is preserved.
