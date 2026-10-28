---
title: Produce and import Vitest evidence
description: Choose local source-bound test execution or explicitly unverified report import.
---

Use the full source checkout with Bun 1.4.2 and installed pinned dependencies. For your own configured repository, declare installed Vitest 4, track a root `vitest.config.ts`, real tests, the registry/policy and a mapping such as:

```json
{
  "schemaVersion": 1,
  "mappings": [{ "componentId": "ui.button", "files": ["tests/button.test.ts"] }]
}
```

The component must exist in the registry; each canonical relative file must exist inside that repository. Map tests of actual component behavior. Every required mapped file needs completed passing assertions. Shared files may be mapped deliberately to multiple components; this declaration does not prove coverage.

## Run tests and evaluate in one process

Commit tracked inputs, ensure clean Git HEAD and ignore `artifacts/` before generating output. The policy must accept producer `vitest` for check `unit-test`:

```sh
mkdir -p artifacts
bun run governator check --mapping governance/tests.json \
  --format json --report-schema 2 > artifacts/governance.json
```

The checkout's mapping uses `tests/demo-ui.test.ts`. `check` runs installed Vitest through Bun, retains raw JSON and `receipt.json` in a unique artifact directory, then rechecks source/config/mappings. Receipt location goes to stderr; report JSON goes to stdout. Exit 0 satisfies policy, 1 records failed/insufficient requirements, and 2 indicates invalid input or runtime error. Inspect the exit status as well as output.

Tests/config and dependencies execute with operator trust; there is no hostile same-user sandbox. Skipped required tests, no tests, failed hooks and contradictory exit/report results cannot become passing evidence. Passing unit tests cannot waive other policy requirements.

## Convert an existing report

```sh
bun --bun vitest run --reporter=json --outputFile=artifacts/vitest.json
bun run governator evidence import --format vitest \
  --file artifacts/vitest.json --mapping governance/tests.json
```

Import emits an envelope, without changing registry, lifecycle or canonical evidence. Exit 0 means conversion succeeded even when tests failed. Imported records stay unverified. For a different checkout use `--root /absolute/repository`; `--report-root /original/ci/checkout` normalizes report filenames, and `--commit SHA` declares a source association. Neither flag verifies that source association.

Raw imports do not reconcile every top-level suite-summary counter; contradictory suite summaries can still become unverified records. Saved receipts and imported reports cannot recreate local runner attestations. See [evidence and trust](/explanation/evidence-and-trust/).
