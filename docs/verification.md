# M0 verification — 26 October 2026

Implementation is local in `/Users/alancurrie/Projects/guvnor`, on `codex/m0`. M0 was verified before its local implementation commit. The local `main` pointer remains at the empty bootstrap commit; `codex/m0` contains the implementation. No remote is configured; no push, package version application, publishing or release workflow execution occurred.

## Observed results

| Verification                                     | Actual result                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Bun runtime                                      | 1.4.2, including inside Moon tasks                                                                |
| `bun install --frozen-lockfile`                  | Pass                                                                                              |
| `bun run check`                                  | Pass: all 7 Moon tasks                                                                            |
| TypeScript strict check                          | Pass                                                                                              |
| Oxlint + Effect 4 recommended preset             | Pass with warnings denied                                                                         |
| Oxfmt check                                      | Pass                                                                                              |
| Vitest under Bun                                 | 52 tests passed across 5 files                                                                    |
| Generated JSON Schema/TypeScript freshness       | Pass                                                                                              |
| Protocol source/built dependency boundary        | Pass                                                                                              |
| `bun run build`                                  | All 4 Moon package builds pass, no build warnings                                                 |
| Clean local copy without node_modules/dist/cache | Frozen install, complete checks (52 tests) and all 4 builds pass                                  |
| `bun --bun changeset status`                     | Four private packages have patch intent; no versions applied                                      |
| Publint for protocol/core/versioning/CLI         | All pass                                                                                          |
| `bun pm pack` for all 4 packages                 | Pass; local tarballs only                                                                         |
| Packed protocol in a separate consumer           | Installs only protocol; TypeScript consumption passes; no runtime exports or runtime dependencies |

The fresh snapshot was `/private/tmp/governanator-m0-clean-3uey51bq`. The standalone protocol consumer was `/private/tmp/governanator-protocol-consumer-liitflm4`. These are local test copies, not hosted qualification or registry installations. All application/tool packages remain private. Packed CLI/core/versioning interoperability outside the monorepo has not been qualified; see releasing.md.

## Built CLI smoke results

The built `packages/cli/dist/main.mjs` was invoked as a separate Bun process, at explicit evaluation time `2026-10-26T12:00:00.000Z` where applicable.

| Case                        | Observed exit | Outcome                                                          |
| --------------------------- | ------------- | ---------------------------------------------------------------- |
| `validate`                  | 0             | Four registry components and policy valid                        |
| Button, demo policy         | 0             | ready                                                            |
| Select, demo policy         | 1             | blocked: failed test, missing documentation, prerelease contract |
| All components, demo policy | 1             | Alert/Button ready; LegacyAlert/Select blocked                   |
| Unknown CLI option          | 2             | Actionable input error                                           |

Raw smoke output is in ignored `artifacts/verification/`; local tarballs are in ignored `artifacts/packs/`. These demonstrate M0 behavior, not actual test producer evidence, external approval, package publication, adoption or deployment.

## Independent review and fixes

A fresh read-only reviewer identified no Critical findings, two Important findings and one Minor. Both Important findings received regression tests observed failing before the fix and passing after it:

1. In-repository symlink targets could escape Git tracking/dirty path checks. M0 now rejects symlinked source/configuration/evidence inputs, including in-root targets.
2. Stable readiness accepted 0.x/prerelease component contracts. Such contracts now block promotion to stable.

The final full suite passes 52/52. No second review was requested; the fix pass was verified with the regression tests and full checks.

Deferred minor: `assessVersion` uses npm-style SemVer parsing, which accepts `v1.0.0` or leading whitespace. Registry/contract schemas reject those forms. The helper should use the same canonical validation in a follow-up; no insufficient-bump acceptance was demonstrated.

## Remaining scope

- M1: genuine machine-report import; public API extraction/diff; Changesets intent validation; exact candidate release enforcement; React/Storybook addon, UI and clean npm/pnpm consumer qualification.
- M2: MCP v2 read-only server and CLI/Storybook/MCP parity.
- M3: trusted external reviewers, publication/deployment provenance and adoption integrations.
- Before publication: decide backend distribution, qualify packed CLI consumers, verify package/scope ownership and activate/configure the disabled release template explicitly.

Symlinked inputs are intentionally unsupported in M0. Baseline hashes detect alteration but cannot authenticate a publisher. Git/policy owner review needs host rules; local JSON cannot establish that authority. CLI source maps are disabled for the pinned tsdown dual-entry build. Moon's pinned runtime maintains local proto cache metadata.
