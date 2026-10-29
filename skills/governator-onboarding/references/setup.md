# Setup reference

Use the published package README and installed `--help` as the version-specific contract:

- https://github.com/opsydyn/governator/tree/main/packages/cli
- https://github.com/opsydyn/governator/tree/main/packages/mcp
- https://opsydyn.github.io/governator/how-to/storybook-addon/

For local governance, prepare `governance/components.yaml`, `governance/policy.yaml`, and a `governance/tests.json` mapping existing Vitest files to component IDs. Read the CLI README's canonical schemas before generating them. Keep generated reports under ignored `artifacts/`; the Storybook configuration must point at the report's actual served URL.

Run from the consumer repository root, with Bun and locally installed packages:

```sh
bun ./node_modules/.bin/governator --help
bun ./node_modules/.bin/governator validate
```

Once the configured inputs are committed and the user authorizes test execution:

```sh
bun ./node_modules/.bin/governator check --mapping governance/tests.json --format json --report-schema 2 > artifacts/governance.json
```

Exit 1 can still produce a valid report. Inspect the output and reasons before continuing; exit 2 requires correction. Never label an empty or failed command's output as evidence.

For MCP, export to a fresh filename:

```sh
bun ./node_modules/.bin/governator snapshot export --report artifacts/governance.json --out artifacts/governance-snapshot.json
bun ./node_modules/.bin/governator-mcp --root /absolute/path/to/project --snapshot artifacts/governance-snapshot.json
```

Configure the selected client to spawn the absolute Bun binary and installed MCP entry point with those arguments. Stdio stdout is JSON-RPC only. No network server is required.

Recovery: configuration errors require fixing paths/schema; dirty inputs require an authorized source commit; missing evidence requires the configured producer; stale snapshots require fresh inputs/export/restart. Do not weaken a policy or repeatedly regenerate the same stale evidence to conceal these conditions.
