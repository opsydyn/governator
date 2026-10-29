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

The three expected filenames are `opsydyn-governator-cli-0.1.0.tgz`, `opsydyn-governator-mcp-0.1.0.tgz`, and `opsydyn-storybook-addon-governator-0.1.0.tgz`. Capture writes `candidate.json` exclusively; rehearsal writes `rehearsal.json` exclusively. Existing evidence is not overwritten. The test transport snapshots all bytes and emits in-memory fake receipts: it has no network or npm publishing capability. A changed file before rehearsal is rejected; changes to an input buffer after snapshot do not change fake receipt hashes. The separate macOS fixture invokes the real npm client under sandbox-exec with outbound access restricted to loopback, dummy credentials, lifecycle scripts and provenance disabled. Its fake registry verifies the received archive hashes and writes `npm-rehearsal.json`. It fails closed if the sandbox is unavailable; there is no unconfined fallback.

## Boundaries and remaining release work

The fixture uses the real local npm client and a fake registry, but does not establish npm OIDC, real registry readback, production runner isolation, protected filesystem custody, concurrent file mutation during reads, identity or human approval. A hash before passing a mutable path to npm does not prove which bytes npm will read. Before publication, qualify a real transport and custody boundary for the reviewed archives; test production credentials, provenance and registry readback. A three-package publish is not atomic: design and test recovery for partial or unknown outcomes. Also verify npm scope ownership, reconcile security advisories and rerun independent consumer tests from the actual release commit. Actual publication requires separate authorization.

## Injected registry coordinator

`bun run release:adapter:qualify /absolute/path/to/archives REVIEWED_SHA256` runs a local, in-memory registry fixture using the retained candidate archives and writes `adapter-rehearsal.json` without overwriting prior evidence. It checks complete preflight, exact-byte readback, a lost acknowledgement followed by retry, and a conflicting existing version. The coordinator snapshots the archive bytes, stops on an unknown outcome or conflict, and checks existing packages before retrying. A successful fixture run is not permission to publish.

The preflight and immediate recheck do not reserve a version atomically; a real transport must handle concurrent publication and uncertain outcomes. This fixture has no durable journal, production registry transport or protected archive custody. Already verified packages are not continuously monitored for changes. Real authentication, npm behavior, production readback and custody remain separate release prerequisites, as do review of the archives and independent consumer qualification on the final commit. The release command and hosted release job remain disabled.

## Experimental npm transport

An unwired transport in `scripts/npm-transport.ts` can use npm with a private, read-only staged snapshot, isolated npm configuration and scripts disabled, then fetch the registry archive for exact-byte verification through the coordinator. The transport is not invoked by the release command or hosted workflow. A staging file can still be changed by a process with the same runner identity, including between its checks; file permissions and readback do not establish immutable custody. A registry 404 is treated as absent and can be ambiguous under restricted access. Both require a suitable isolated production environment and real-registry qualification before enabling publication.

The `scripts/qualify-npm-transport.ts` fixture requires macOS and a network sandbox that denies external connections while allowing loopback. It accepts a clean source-bound candidate, the selected digest, and an absolute npm executable; it verifies actual npm uploads to a fake registry with dummy credentials, simulates a lost acknowledgement and verifies the retry. It writes a separate non-publishing receipt. It does not verify npm authentication, hosted provenance, real registry behavior, human approval, or a production custody boundary.

## Hosted non-publishing qualification

The manually dispatched `Non-publishing release qualification` workflow runs only on `main`. It builds and packs once without npm credentials, captures a source-bound candidate, and transfers it by GitHub artifact ID. A separate protected-environment job checks the candidate digest and each archive hash before requesting GitHub attestations for those transferred bytes. A third job uses the repository's `NPM_TOKEN` only to run `npm whoami` against npm. None of these jobs publishes a package or enables the disabled release workflow.

Configure the `release-qualification` environment to allow only `main` before running the workflow. GitHub artifacts expire and can be deleted; preserve the artifact ID, artifact digest, candidate digest, archives, and attestations after review. Attesting downloaded bytes establishes what that job attested, not independent proof that the build was reproducible, human approval, npm provenance, or immutable custody inside the runner. Token authentication alone does not prove package write permissions, and npm OIDC publishing permissions cannot be established by `whoami`. Production publication and handling of partial or unknown real-registry outcomes remain separate work.

## Linux sealed archive custody fixture

The hosted qualification includes a separate Linux custody fixture. The workflow creates a fresh network namespace with only loopback enabled, then runs an unprivileged npm child against a dummy registry and dummy token. The fixture copies each selected archive into a Linux `memfd`, applies permanent write, growth and shrink seals, and presents it through a root-owned path. It checks that the child cannot modify the descriptor or replace the path and that the fake registry receives the selected bytes. The fixture receipt is an expiring GitHub Actions artifact.

The network boundary comes from the workflow-created namespace; the script's namespace and single-address probes alone do not prove network isolation. This is qualification of a fixture, not a production publisher: the real release command and workflow remain disabled. A real publisher must bind the reviewed artifact and approval, protect its runner and executable, independently qualify credentials and provenance, and handle partial or uncertain registry outcomes. No registry write is performed by this fixture.
