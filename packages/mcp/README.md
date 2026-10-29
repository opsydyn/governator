# Governator MCP adapter

Bun stdio application for fourteen immutable governance queries. Published as `0.1.0` on npm. Requires Bun **>=1.4.2** and a source-bound snapshot exported by the `@opsydyn/governator-cli` package. Node runtime compatibility is not claimed.

## Consumer quick start

Install the MCP package in the consumer project:

```sh
bun add --dev @opsydyn/governator-mcp@0.1.0
bun ./node_modules/.bin/governator-mcp --root /absolute/path/to/consumer --snapshot artifacts/governance-snapshot.json
```

To create a governance-only snapshot with an installed CLI in the same configured project:

```sh
bun ./node_modules/.bin/governator check --mapping governance/tests.json --format json --report-schema 2 > artifacts/governance.json
bun ./node_modules/.bin/governator snapshot export --report artifacts/governance.json --out artifacts/governance-snapshot.json
```

The CLI README includes canonical registry, policy and test mapping examples. `check` requires consumer-installed Vitest 4, tracked tests and root `vitest.config.ts`; configure and commit them before running it.

For an MCP client, configure your absolute Bun executable with arguments `/absolute/path/to/consumer/node_modules/@opsydyn/governator-mcp/dist/main.mjs`, `--root`, `/absolute/path/to/consumer`, `--snapshot`, `artifacts/governance-snapshot.json`. Client configuration is manual. Both flags are required; malformed startup exits 2 on stderr, while serving stdout is reserved for JSON-RPC.

Use the same clean, committed Git project that produced the snapshot. Its referenced governance inputs must remain tracked, contained and unchanged; generated reports/snapshots belong under ignored `artifacts/`. The loader checks matching Git HEAD, digests and expiry (at most 24 hours). Re-export to a new filename and restart after source/report changes. Submodules, clean/process Git filters, hidden index flags and symlinked input paths are unsupported. The repository-only operator runbook is `docs/mcp.md` in the source checkout; it is not included in this tarball.

The snapshot envelope is schema 1 and preserves embedded report schema 1 or 2. All tools are read-only: they never run tests, edit files, approve or publish. Saved decisions remain `unverified-snapshot` or `simulated-snapshot`; evidence metadata and receipts do not restore producer trust. Omitted release configuration returns `not_configured` for release/contract tools. Publication, deployment and human approval remain separate gates.

The server uses Effect’s MCP implementation internally. The `createMcpServer(service)` export provides `connect(transport)` and `close()` for an MCP-compatible transport; it no longer returns the MCP SDK `McpServer` class, so SDK-specific class methods are not available.

Independent packed consumer qualification must be recorded separately, including whether dependencies came from caches or reconstructed local sources. No registry availability or automatic client activation is claimed.

Development source adds `list_ready_components` as the preferred name. `list_approved_components` remains available with identical results and `approvalVerified: false`. This brings development discovery to fifteen tools; published 0.1.0 exposes fourteen.
