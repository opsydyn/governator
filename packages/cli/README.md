# @governator/cli

Bun CLI for local governance reports, source-bound Vitest checks, declaration compatibility and snapshot export. Private `0.1.0` preview; registry installation is unavailable. Bun **>=1.4.2** is required; Node runtime compatibility is not claimed. The private engine and Effect are internal implementation details.

## Consumer quick start

Given an actual locally packed CLI tarball, install it into your own project (replace the illustrative path). Its declared runtime dependencies must also be available from your chosen package source:

```sh
bun add --dev /absolute/path/to/governator-cli-0.1.0.tgz
bun ./node_modules/.bin/governator validate
bun ./node_modules/.bin/governator evaluate --format json --report-schema 2 > artifacts/governance.json
```

Before running these commands, configure the project's canonical `governance/components.yaml`, `governance/policy.yaml` and optional evidence/waivers, using the minimal example below and adapting paths, ownership and requirements to your project. Create and Git-ignore `artifacts/` before redirecting output. There is no automatic initialization command. Normal evaluation requires Git and a clean, committed source tree; consumed governance files must be tracked.

A minimal `governance/components.yaml` can use JSON syntax (valid YAML):

```json
{
  "schemaVersion": 1,
  "components": [
    {
      "id": "ui.button",
      "name": "Button",
      "package": "@example/ui",
      "owners": ["@design-system"],
      "lifecycle": "stable",
      "source": "src/Button.tsx",
      "stories": ["src/Button.stories.tsx"],
      "contractVersion": "1.0.0",
      "exportPath": "@example/ui"
    }
  ]
}
```

A deliberately limited local unit-test policy in `governance/policy.yaml`:

```json
{
  "schemaVersion": 1,
  "policyVersion": "local-unit-v1",
  "requirements": {
    "stable": {
      "checks": [{ "id": "unit-test", "acceptedProducers": ["vitest"], "maxAgeHours": 24 }]
    }
  },
  "transitions": {
    "draft": ["candidate"],
    "candidate": ["stable"],
    "stable": ["deprecated"],
    "deprecated": ["retired"],
    "retired": []
  },
  "waivers": { "enabled": false, "maxDurationDays": 14, "disallowFor": ["ownership"] }
}
```

For `governance/tests.json`, map actual tests to the same component ID:

```json
{
  "schemaVersion": 1,
  "mappings": [{ "componentId": "ui.button", "files": ["tests/button.test.ts"] }]
}
```

This example declares local unit-test readiness only. It does not establish production acceptance or real design/reviewer approval. Source, story and test paths must exist in your project.

For locally produced unit-test evidence, install and declare **Vitest 4** in the consumer project, track a root `vitest.config.ts`, the tests, governance inputs and `governance/tests.json` mappings, then commit those inputs. Keep generated `artifacts/` ignored. Use a full Git checkout without submodules, clean/process filters or hidden index changes (assume-unchanged/skip-worktree):

```sh
bun ./node_modules/.bin/governator check --mapping governance/tests.json --format json --report-schema 2 > artifacts/governance.json
bun ./node_modules/.bin/governator snapshot export --report artifacts/governance.json --out artifacts/governance-snapshot.json
```

`check` executes the consumer's installed test/config code with Bun, rechecks clean source, and retains raw Vitest output and a receipt under ignored `artifacts/`. The policy must accept producer `vitest` for `unit-test`; passing tests cannot waive other requirements. A saved receipt or imported report does not recreate in-process trust. Snapshot export runs no producers, creates a new file exclusively, and requires a fresh filename for each export. To serve it, install the locally packed `@governator/mcp` package and run `bun ./node_modules/.bin/governator-mcp --root /absolute/path/to/consumer --snapshot artifacts/governance-snapshot.json`.

Reports default to schema 1; `--report-schema 2` adds evidence metadata without changing readiness or trust. Use schema 1 for older readers. Exit codes are **0** satisfied, **1** blocked/insufficient evidence and **2** invalid input/runtime error. A valid report can record a blocked gate. JSON metadata does not authenticate evidence; local checks and saved snapshots do not establish approval, publication or deployment.

Independent packed consumer qualification and real registry installation are separate release gates. Local or reconstructed package sources must be identified in qualification evidence. Additional repository-only documentation is located at `docs/test-evidence.md`, `docs/storybook-contracts.md` and `docs/mcp.md` in the source checkout; those files are not included in this tarball.
