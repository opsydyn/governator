# M1 evidence slice verification — 26 October 2026

Base M0 commit: `b7622ba`. Slice branch: `codex/m1-evidence`. This is the first bounded part of M1, not a claim that the complete milestone is done.

## Implemented

- Pure Vitest 4 JSON adapter with strict consumed-field decoding, assertion counts/outcomes, explicit component/test file mappings, timestamps and report content digest.
- `evidence import`: versioned JSON conversion with explicitly declared source association and unverified evidence. It cannot import a trusted attestation map.
- `check`: fixed installed Vitest 4 process, clean tracked source/governance/config/mappings before/after, observed run times, fresh retained report and receipt, and in-memory evidence digests supplied to the same core evaluator.
- No test/report shell commands from configuration. No added package dependencies or report-protocol schema changes.

## Observed checks

| Check                                                 | Result                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `bun run check`                                       | All 7 Moon tasks pass                                                 |
| Vitest under Bun 1.4.2                                | 66 tests across 7 files pass                                          |
| Strict typecheck                                      | Pass                                                                  |
| Oxlint + Effect preset, warnings denied               | Pass                                                                  |
| Oxfmt                                                 | Pass                                                                  |
| Protocol generation freshness and dependency boundary | Pass                                                                  |
| `bun run build`                                       | All 4 packages pass                                                   |
| Changesets status                                     | Valid patch/minor intent; no version or release command executed      |
| Built executable with real passing Vitest tests       | Exit 0, ready, verified-inputs under the configured local test policy |
| Built executable with real failing Vitest tests       | Exit 1, blocked                                                       |
| Built executable with real skipped Vitest tests       | Exit 1, insufficient_evidence                                         |

Real-process integration tests additionally verify that re-importing the generated report strips no trust boundary (the new import is unverified), source changes before/during execution invalidate proof, unknown runner commands are rejected, and imported report fields cannot grant approvals.

Built CLI smoke repositories remain under `/private/tmp/governanator-m1-smoke-b5evgtmu`. Summary outputs/receipt paths are in ignored `artifacts/verification/m1-*.json` and `m1-*-receipt.txt`. These test a local behavior fixture, not production React components or hosted CI.

## Independent review

A fresh read-only review found two Important source-binding gaps. Both were reproduced as failing regression tests before fixing, followed by green regressions and the full suite:

1. Ignored/untracked registry/policy files could be omitted from the recorded commit. The local runner now requires every consumed governance input tracked when present.
2. Git assume-unchanged/skip-worktree flags could hide tested source edits. The local runner rejects those flags, including sparse-checkout entries, before and after execution.

No Critical findings. One Minor is deferred: assertion counters/failure flags are validated, but all suite-summary counters are not fully reconciled; an inconsistent raw report may still convert to unverified evidence. The earlier M0 helper's permissive npm-style version normalization is also still deferred. Neither finding demonstrated a provenance bypass or insufficient-bump acceptance.

## Limits and remaining work

Local process proof is not a cryptographic CI/reviewer identity. Repository test/config code and installed dependencies are operator-trusted; hostile same-user isolation is not provided. Declared component coverage is reviewed mapping rather than inferred completeness. The initial runner requires a root `vitest.config.ts`, Vitest 4, clean Git inputs, ignored artifacts, no hidden index flags, and completes within 30 seconds.

M1 still needs API extraction/compatibility diffs, Changesets intent checking, immutable candidate release enforcement, GitHub Actions evidence integration/Markdown summaries, and the React/Storybook addon plus clean consumer qualification. M2/M3 remain unchanged. No package was versioned, pushed, published, deployed or activated for release by this slice.
