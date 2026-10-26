# Vitest evidence — first M1 slice

M0 is committed at `b7622ba`. This slice adds genuine Vitest 4 JSON import and an optional local producer-to-gate path. It does not complete M1's API diff/release checks or Storybook UI.

## Explicit mappings

Create a tracked `governance/tests.json` alongside the canonical registry and policy:

```json
{
  "schemaVersion": 1,
  "mappings": [{ "componentId": "ui.button", "files": ["tests/button.test.ts"] }]
}
```

The component must exist in that repository's registry, and every named test file must exist inside the repository. Files use exact, canonical relative paths. One component may require several files; all must contain completed passing assertions to produce passing evidence. A shared file can be deliberately mapped to more than one component, but this is a reviewed declaration of coverage, not an inferred guarantee.

The M0 repository's UI entries are interface fixtures, not tested React components. Do not map its engine tests to those UI IDs merely to get a passing badge. Integration tests construct isolated repositories with a real Button behavior function and real Vitest executions to demonstrate the adapter. Real React/Storybook components remain later M1 work.

## Import an existing report

Run the project's declared Vitest 4 installation, for example:

```sh
bun --bun vitest run --reporter=json --outputFile=artifacts/vitest.json
bun run governanator evidence import --format vitest \
  --file artifacts/vitest.json --mapping governance/tests.json
```

For another repository, add `--root /absolute/repository`. `--commit SHA` declares which source the external report claims to cover; by default it uses local Git HEAD. `--report-root /original/ci/checkout` lets the adapter normalize absolute filenames from a different checkout. The association stays explicitly `declared`. Mappings and source/report files remain contained in the chosen repository, without symlinked data paths.

Import prints a versioned JSON envelope with the report digest, source association, evidence records and missing-coverage reasons. Every imported record is **unverified**, even if the report claims success or contains approval/provenance fields. It does not alter the registry, canonical evidence file or lifecycle. Import exit 0 means successful conversion, not a passing governance gate; malformed reports exit 2. Failed tests produce failed evidence in the envelope. A missing, empty, partial-skipped or skipped-only mapping produces no passing record.

## Run and check locally

For a repository with tracked source, a tracked root `vitest.config.ts`, a declared installed Vitest 4 dependency and a clean Git tree without assume-unchanged/skip-worktree index flags:

```sh
bun run governanator check --mapping governance/tests.json --format json \
  > artifacts/governance.json
```

Ignore `artifacts/` in Git first. The target policy must explicitly accept producer `vitest` for `unit-test`; other required checks still need their own evidence. Passing unit tests cannot waive documentation, design approval or release requirements.

`check` runs the installed Vitest binary through Bun with fixed argument arrays and the mapped file paths. It accepts no arbitrary shell command, demo switch, attestation map, commit override or evaluation-time override. It creates a unique local report directory under ignored `artifacts/`, captures host-observed times, and rechecks the clean HEAD/source/config/mappings after execution. Every consumed governance file must be tracked when present. Index flags that can conceal modifications (including sparse-checkout skip-worktree entries) are rejected in this slice. An altered source tree or changed commit invalidates the run.

Only this in-process runner-to-gate path supplies content-bound attestations. The check uses the same evaluator and report schema as `evaluate`; a future UI can read its report. JSON report stdout stays separate from the receipt path on stderr. Raw Vitest JSON and a `receipt.json` are retained in the run directory. The receipt is an audit artifact, not a signature: importing it or the raw report later does not reconstruct trust.

Exit codes are 0 for satisfied policy, 1 for failed/insufficient requirements, and 2 for invalid inputs or runner/runtime errors. No tests found, skipped required tests, failed setup hooks and unsupported report shapes never turn green. Unexpected unmapped files or an exit/report contradiction invalidate the local run. The runner times out after 30 seconds in this initial slice.

## Trust limits

This proves only the configured local process boundary. The user authorizes executing that repository's test/config code when invoking `check`; that code and installed dependencies are trusted by the local operator. M0's dependency-free public protocol is unchanged. No external reviewer identity, signed CI provenance, candidate package artifact, npm publication, application adoption or deployment is verified. Tests running with the same OS privileges are not sandboxed from the producer. CI identity and stronger adversarial isolation require a later trusted host adapter.

The importer follows the [Vitest 4 JSON reporter](https://v4.vitest.dev/guide/reporters) and is qualified against the pinned Vitest 4.1.12 installed here. It consumes validated semantic fields and tolerates unrelated reporter metadata. It does not infer test coverage from component names or from mere report-file presence.

Known minor: assertion counters and failure flags are validated, but all top-level suite-summary counters are not yet reconciled. Raw imports with contradictory suite counts can therefore still be converted to unverified records. Full suite-summary reconciliation is a follow-up; import is never approval.
