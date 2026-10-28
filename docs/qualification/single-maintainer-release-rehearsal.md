# Single-maintainer 0.1.0 local release rehearsal

This is a local rehearsal for one maintainer. It neither authenticates the maintainer nor authorizes or performs npm publication. Two-owner approval and the independent freshness witness are deferred. The real release command and hosted release job remain disabled.

The candidate record contains an operator-supplied clean Git commit and exact SHA-256 and size for each of the three approved `0.1.0` package archives. The selected digest is the maintainer's review reference, not a signature or an authenticated approval. The commands reject a changed commit, changed bytes, duplicate, missing or unexpected package, and a nonempty active Changesets queue. They inspect each archive's packed name/version, local dependency references, regular entries and required notice files. An empty queue is a first-release precondition; future version intent should still be handled by Changesets before a future candidate is built.

## Prepare and review

Use a clean, isolated checkout of the intended commit and the pinned toolchain. Build and test it, then pack the three packages once into a new private directory. Preserve those archives and inspect their contents and independent consumer behavior before selecting the candidate digest. The capture command does **not** prove the archives were built from the stated commit: the maintainer must establish the build provenance separately. Keep the candidate, the archives and the review digest together; never overwrite them with later builds.

```sh
# Run from a clean isolated checkout; archive directory must already exist and be private.
bun run build
npm pack ./packages/cli ./packages/mcp ./packages/storybook-addon --ignore-scripts --pack-destination /absolute/path/to/archives
bun scripts/rehearse-single-maintainer.ts capture /absolute/path/to/archives
# Independently review candidate.json, archives and test evidence, then pass the displayed digest.
bun scripts/rehearse-single-maintainer.ts rehearse /absolute/path/to/archives REVIEWED_SHA256
# On macOS, send the same archives to a loopback-only fake npm registry.
bun scripts/rehearse-npm-archives.ts /absolute/path/to/archives REVIEWED_SHA256
```

The three expected filenames are `governator-cli-0.1.0.tgz`, `governator-mcp-0.1.0.tgz`, and `governator-storybook-addon-0.1.0.tgz`. Capture writes `candidate.json` exclusively; rehearsal writes `rehearsal.json` exclusively. Existing evidence is not overwritten. The test transport snapshots all bytes and emits in-memory fake receipts: it has no network or npm publishing capability. A changed file before rehearsal is rejected; changes to an input buffer after snapshot do not change fake receipt hashes. The separate macOS fixture invokes the real npm client under sandbox-exec with outbound access restricted to loopback, dummy credentials, lifecycle scripts and provenance disabled. Its fake registry verifies the received archive hashes and writes `npm-rehearsal.json`. It fails closed if the sandbox is unavailable; there is no unconfined fallback.

## Boundaries and remaining release work

The fixture uses the real local npm client and a fake registry, but does not establish npm OIDC, real registry readback, production runner isolation, protected filesystem custody, concurrent file mutation during reads, identity or human approval. A hash before passing a mutable path to npm does not prove which bytes npm will read. Before publication, qualify a real transport and custody boundary for the reviewed archives; test production credentials, provenance and registry readback. A three-package publish is not atomic: design and test recovery for partial or unknown outcomes. Also verify npm scope ownership, reconcile security advisories and rerun independent consumer tests from the actual release commit. Actual publication requires separate authorization.
