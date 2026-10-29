# Governator 0.2.0 local candidate qualification

Candidate source: `cfd81a9f7a2285a42ad850498071693b8d8cbf7a` on local main. Changesets consumed the approved minor intent and versioned the CLI, MCP and Storybook addon to 0.2.0, with generated changelogs. The demo remains pinned to published 0.1.0. No push, publication or hosted workflow dispatch occurred.

## Retained candidate

The three archives were packed once with npm pack --ignore-scripts from explicitly built outputs after the source commit. Retained directory: `artifacts/governator-0.2.0-t2XKLi`. It contains candidate.json, pack.json, SHA256SUMS and inventory-digest.txt. The inventory is a local-only record, not the historical first-release adapter schema or a publication approval.

Canonical inventory SHA-256: `a24dd5d0a93968596fed6dede30bcc1c5e9b1af57fba28567312f111bb29ea88`. Its digest uses JSON with sorted keys and compact separators. Each record also includes SHA-512 npm integrity. Archives and inventory hashes were rechecked unchanged after the rehearsals.

| Package (0.2.0)                     | Archive bytes | SHA-256                                                            |
| ----------------------------------- | ------------: | ------------------------------------------------------------------ |
| @opsydyn/governator-cli             |        263529 | `9446366783b9731914b72b4f4c51dd1c781f76fccb5e06bf542d721c9e82d629` |
| @opsydyn/governator-mcp             |        287139 | `2fa7837b2be01e43d22cf088e43e0c73ba4316c5b0d1ddb3206dd1d6dcfe6901` |
| @opsydyn/storybook-addon-governator |        161836 | `fbb4050b2d970a755bc0c9e9e407f068c932af437fb4f05f2379ae7976e00639` |

Archive inspection verified names/versions, regular contained paths, unique entries, license/README/notices and conventional runtime dependencies. The CLI's packed onboarding skill and setup reference matched repository source byte-for-byte.

## Automated results

- bun run check: all 18 Moon tasks completed, including 830 tests across 80 files, typecheck, lint, formatting, protocol freshness, dependency boundaries, addon budget, and documentation build/links. Final log: /private/tmp/governator-020-qualified-check.log.
- All three packages passed publint. Frozen installation required no lock changes. All nine Python addon-harness safety regressions passed.
- CLI/MCP independent installed-consumer rehearsal passed: `artifacts/cli-mcp-consumer-RlcBTa/summary.json`, consumer `/private/tmp/governator-consumer-1RraWO`. Checks cover capabilities, optional-dependency diagnostics, exported skill, init plan/apply/validate and overwrite refusal, producers, snapshot creation, fifteen MCP tools and CLI parity. The retained installed MCP reported server version 0.2.0 in an additional stdio handshake probe, recorded in packed-version.json.
- Exact retained-addon independent npm and strict-peer pnpm installs and no-report Storybook builds passed: `artifacts/addon-consumer-abbhsm57/summary.json`, consumers `/private/tmp/governator-addon-pdgqnla9/npm` and `/private/tmp/governator-addon-pdgqnla9/pnpm`.
- The installed packed CLI used each installed addon authoring adapter successfully: read-only tag planning, revision-checked saving, stale-revision rejection and inspection. Evidence: `artifacts/addon-consumer-abbhsm57/packed-authoring.json`.

The first workspace run exposed obsolete 0.1.0 distribution assertions; these now assert 0.2.0. A new MCP regression reproduced stale 0.1.0 server metadata; MCP and CLI version metadata now read their own package manifests. Focused checks and the final full suite passed after correction. Retained-addon qualification accepts an explicit --version while preserving its historical 0.1.0 default. Fresh review found no blockers in versioning and archive selection.

The first npm pack attempt hit a sandbox cache permission error and created no candidate archives. Packing succeeded in a new directory using a separate writable temporary cache. Existing cache ownership was not changed.

## Boundaries and remaining work

The independent consumers use loopback-confined registries and third-party archives reconstructed from extracted Bun cache with preserved manifests. This proves the tested local macOS consumer graphs; it does not prove original third-party tarball integrity, other platforms, live registry publication or hosted CI. The addon build emits Storybook's large-chunk advisory; both builds exit successfully.

Manual visual, keyboard, accessibility and first-user onboarding acceptance remains deferred until last. No browser acceptance is claimed. At candidate capture, the historical qualification and publishing workflows and first-release capture adapter remained pinned to 0.1.0. Subsequent [local publishing-adapter preparation](0-2-publishing.md) adapts the publishing workflow while preserving these exact archives; remote staging and hosted qualification remain pending. The single-maintainer model remains selected and dual custody stays deferred.

Raw archives, logs and consumer evidence are ignored local files. Keep the retained directory and evidence if moving or cleaning this checkout. This documentation commit follows the candidate source commit; it does not change or repack the retained archives.
