# Local Changesets and exact release candidates

The release gate compares a real local tarball to an explicit, immutable local baseline archive. This is offline qualification, not npm publication authentication. It never sets publishable to true. Ordinary changed releases remain blocked until a trusted owner-review adapter exists; explicit demo mode can exercise a simulated reviewed release with a conspicuous assurance label.

## Commands

Run from a clean committed source snapshot with installed pinned dependencies:

```sh
bun run governanator release candidate --config governance/release.json --out artifacts/my-candidate
bun run governanator release check --config governance/release.json --candidate artifacts/my-candidate/candidate.json
# Or capture and inspect a new candidate in one invocation:
bun run release:plan
# Real isolated React package simulation; asserts the expected outcomes, without publication:
bun run release:demo
```

Candidate capture returns exit 0 when the artifact was successfully captured; that is not an eligibility decision. Plan/check return 0 for the requested local policy's eligible result, 1 for blocked/insufficient evidence, and 2 for invalid input/integrity/runtime failure. Output directories must be new direct children of ignored artifacts/. They are not overwritten.

The repository intentionally proposes package 8.4.2 / Button contract 1.2.1 with a patch Changeset despite removing tone. The exact release check must return blocked. Raising the declaration to minor is still insufficient. The isolated major demonstration proposes package 9.0.0 / Button 2.0.0, requires current simulated review, migrated consumer compilation, actual local tests and migration/impact/matrix documents, and returns eligible_under_demo_policy only after those checks. It still has publishable=false, publication/deployment/adoption unknown. Normal mode rejects that simulated review.

## Source and artifact association

Capture checks clean Git HEAD, index flags and tracked contained governance inputs. It builds in a disposable clean clone of that commit, linking only the operator's installed dependency cache, then runs Bun pack with pack hooks disabled after the explicit build. Ignored dist/.env data in the working checkout is not copied. Tests and build/dependency code run with operator trust; no hostile same-user sandbox or signed build identity is claimed.

The candidate records exact archive digest, manifest, content-and-mode hashes for every packed file, emitted API, source commit, creation time and the digest of baseline/config/registry/policy/mapping/Changesets/classification/consumer/document inputs. The baseline's decoded data is checked against its original tracked tarball, not merely trusted as mirrored JSON. Both expected hash and baseline files remain a reviewed-file trust boundary; replacing all of them does not authenticate a publisher.

Check rereads the exact tarball, recomputes its payload and API, reproduces payload from a second clean source build, compiles tracked consumer fixtures against the actual exported declarations, reruns mapped Vitest tests, and verifies source, inputs, candidate metadata and archive again. It never trusts a saved ready result or receipt. Candidate/review/test freshness is bounded to 24 hours. Archive byte digest stays exact; reproducibility compares all payload bytes, file modes, manifest and API, allowing only irrelevant tar/gzip container metadata to differ.

## Intent and review rules

All pending .changeset/*.md except README.md must be enumerated; parsing uses the pinned real Changesets parser. Distributed changes require an applicable non-none declaration and the exact resulting package version. The engine computes the highest known detected bump independently of unknown changes, then combines it with per-component classification. A reviewed unknown cannot erase an added export or known break. Changed runtime files also require intent, even if declarations stay the same. Documentation/test changes outside distributed output do not force a release; a changed packed README is a distributed change.

Component contract versions and shared package versions are checked separately. Actual export/peer/dependency surface changes conservatively require major. Prerelease and 0.x contracts do not count as stable. Removing a component remains blocked pending deprecation-window verification. Major migration/review requirements cannot be bypassed by choosing a major number or adding approved=true to a document.

Explicit simulated review must match source commit, exact tarball digest and input digest; have required owner roles, a reason, observation/expiry times and a maximum one-day lifetime. It only works with --demo. Required migration guide, manual migration plan, consumer impact and compatibility matrix documents must be tracked and substantive. Known local consumers are compiled; external consumer usage remains unknown. Simulated review demonstrates mechanics, not actual human/visual/accessibility acceptance.

## Supported surface and UI

This first exact archive analyzer supports one root exports types entrypoint, plus an optional package.json export. Additional entrypoints, declaration wildcards, local file/workspace runtime links, symlink/hardlink/special archive entries, duplicate file entries and unsafe paths fail closed. Limits: 4 MiB compressed archive, 4 MiB per file, 16 MiB expanded file contents, 2,048 entries and bounded metadata/decompression ratio. Larger or more complex packages need a deliberate adapter extension.

The schema-v1 report optionally includes a release summary. Storybook shows the CLI's release eligibility, digests and reasons beside independent readiness/API state; stale or mismatched source release summaries are rejected. Sidebar labels show lifecycle (L) and readiness gate (G) using official manager customization, preserving existing labels. A question mark means identity/report is not yet available (for example an unprepared story); it never implies approval. Readiness markers do not represent release authorization.

## CI boundary

.github/workflows/check.yml defines a read-only local qualification job: checks/builds/Storybook plus actual blocked patch/minor, missing-review major, simulated reviewed-major and tampered-artifact assertions. The fixture job is not a publish authorization. Consumers can require that job in repository settings and invoke release check directly for their candidate gate. No hosted run or branch-protection setting was configured or verified here. The publishing workflow remains disabled. The root release command also fails closed: it cannot invoke Changesets publish using local or simulated eligibility. Re-enable that path only with a trusted publishing adapter.

Source package versions here are proposed candidate versions. Intent is applied to the explicit baseline version; stock changesets version must run on a pre-versioned release branch, not be applied again to these already prepared candidates. The exact version check catches double-bumps.

Remaining external work: authenticated published baselines, trusted GitHub reviewer identity, actual publication/provenance and deployment adapters. Local compiler/SSR evidence does not replace browser keyboard/focus, visual, a11y or human review qualification.
