---
title: CLI commands and exit codes
description: Source-checkout command forms, options and result semantics.
---

Run from the full source checkout using Bun 1.4.2 and installed dependencies. `bun run governator --help` prints the current interface. There is no initialization command. Canonical input paths are described in [policy and registry](/reference/policy-and-registry/).

| Command after `bun run governator`                                       | Purpose and required arguments                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `validate`                                                               | Validate shape, references and contained paths.                                |
| `evaluate`                                                               | Evaluate canonical inputs; no local test execution.                            |
| `check --mapping PATH`                                                   | Run installed Vitest 4 and evaluate with local in-process attestations.        |
| `evidence import --format vitest --file PATH --mapping PATH`             | Convert a report to unverified records.                                        |
| `contracts snapshot --config PATH --declarations PATH`                   | Analyze emitted declarations.                                                  |
| `contracts diff --baseline PATH --candidate PATH --baseline-digest PATH` | Compare against an explicit digest-checked baseline.                           |
| `release candidate --config PATH --out artifacts/NAME`                   | Capture a new exact local candidate.                                           |
| `release plan --config PATH`                                             | Capture/check, or check optional `--candidate PATH`.                           |
| `release check --config PATH --candidate PATH`                           | Verify the supplied candidate.                                                 |
| `snapshot export --report PATH --out artifacts/NAME.json`                | Export immutable query inputs; optional paired `--release PATH --config PATH`. |
| `query --snapshot PATH --tool NAME`                                      | Run a read-only query; optional `--args JSON`.                                 |

All forms accept `--root PATH`. `evaluate` and `check` accept `--target stable`, `--component ID`, `--format json|text` and `--report-schema 1|2`. Both default to report schema 1. `evaluate` additionally accepts `--at YYYY-MM-DDTHH:mm:ss.sssZ` and `--demo`; `check` accepts neither a clock/commit override nor demo evidence. Import accepts `--commit SHA` and `--report-root PATH` as declared associations. Release plan/check accept explicit `--demo`; capture does not.

| Exit | Meaning                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------- |
| 0    | Requested operation succeeded. Evaluation/check policy satisfied; import converted; capture captured; query succeeded. |
| 1    | Evaluation or release check blocked/insufficient evidence.                                                             |
| 2    | Invalid input, integrity or runtime failure.                                                                           |

A successful query may return a recorded blocked decision, unavailable history or `not_configured`. A successful import does not mean passing tests. A successful capture does not establish eligibility. Normal evaluations require clean Git HEAD; `validate` is not approval. See [report schemas](/reference/report-schemas/) and [release workflow](/how-to/changesets-release/).
