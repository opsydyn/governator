# Read-only local MCP

Governator exposes shared governance queries through a Bun stdio application. Published 0.1.0 has fourteen tools; development adds list_ready_components as a compatibility-preserving alias, bringing discovery to fifteen. It loads one explicitly exported snapshot. Tool calls use immutable memory; they do not execute tests, builds, packing, approvals, edits, publication or network requests.

Use Bun 1.4.2, Moon 2.6.4 and TypeScript 5.9.3. The server uses the MCP implementation in Effect 4.0.6; the MCP SDK client 2.4.0 is retained as a workspace development dependency for interoperability tests. Effect is bundled internally, with no MCP SDK server or Zod runtime dependency. The plain protocol and Storybook addon have no MCP dependency.

## Export and launch

From a clean committed checkout:

```sh
bun run build
# Explicit producer work, performed before snapshot export; executes local builds/tests.
bun run dogfood:report
bun run storybook:build
bun run governator snapshot export \
  --report artifacts/dogfood-governance.json \
  --release artifacts/dogfood-release.json \
  --config governance/release.json \
  --out artifacts/m2-snapshot.json
bun run mcp:smoke --snapshot artifacts/m2-snapshot.json
```

The snapshot envelope remains schema 1 and accepts an embedded report of schema 1 or 2. Export preserves the selected report and its schema version exactly. Both export and reload validate strict report shape and evidence association/time semantics; malformed v2 data is rejected without stripping metadata or downgrading to v1. Use `evaluate --report-schema 2` or `check --report-schema 2` to select v2 explicitly; defaults remain v1 and dogfood selects v2.

Export writes a new direct JSON file under ignored `artifacts/`, using exclusive creation. It never runs producers. Select a new filename when exporting again. For governance-only queries, omit both `--release` and `--config`; release/contract tools then report `not_configured`.

Manual client launch: executable `/absolute/path/to/bun`, arguments:

```text
/absolute/path/to/guvnor/packages/mcp/dist/main.mjs
--root /absolute/path/to/guvnor
--snapshot artifacts/m2-snapshot.json
```

Use the absolute Bun executable path reported by `which bun`. Startup requires both flags, validates the source and inputs, and sends failures to stderr with exit 2. Once serving, stdout contains only MCP JSON-RPC. EOF closes the transport; SIGINT/SIGTERM also close it. No client/global settings are modified automatically.

The qualification smoke also checks the built Storybook report. Build Storybook after report generation; its build deliberately bypasses Moon caching because generated ignored public reports do not enter Moon's input hash.

The same service is available without MCP:

```sh
bun run governator query --snapshot artifacts/m2-snapshot.json \
  --tool get_component --args '{"componentId":"ui.button"}'
```

Query exit 0 means the query succeeded, including recorded blocked decisions or unavailable history. Invalid input/runtime failures exit 2. Producer commands retain their existing 0/1/2 meanings.

## Tools and scope

| Tools                                                                         | Result                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `list_components`, `get_component`, `get_component_evidence`                  | Registry, recorded decisions and separate declared/reported evidence             |
| `evaluate_component`, `explain_governance_failure`                            | Core policy evaluation with empty verified-attestation maps                      |
| `get_design_system_report`, `list_approved_components`                        | Unchanged report or policy-eligible records with `approvalVerified=false`        |
| `get_component_contract`, `diff_component_contract`, `list_breaking_changes`  | Available explicit baseline/candidate contracts and pinned analyzer differences  |
| `explain_release_block`, `get_release_manifest`, `get_consumer_compatibility` | Recorded exact local candidate, reasons, digests and saved compiler observations |
| `plan_component_migration`                                                    | Guidance from actual changes and selected documents, without edits               |

Discovery supplies input/output schemas and read-only, non-destructive, idempotent, closed-world hints. The shared Effect schemas validate arguments again. Unknown components are typed tool errors; unknown tool names are MCP protocol errors. Blocked governance decisions are successful tool results. Results carry `snapshotDigest`, source, evaluation time, provenance, scope and limitations in `structuredContent`.

Lists accept `limit` (1–100) and `cursor` (`offset:N`), returning total, nextCursor and truncated. `list_components.filters` supports lifecycle, recorded gate and owner. Unsupported historical versions return `unavailable`; no provider lookup or guessed release history occurs. If differing baseline/candidate contracts share one declared version, an explicit version request returns `ambiguous_contract_version` with source artifact identities. Omit the version to select current, or use the explicit `candidate` diff selector. Migration never invents steps for an ambiguous comparison.

## Provenance and bounds

Saved decisions/receipts/hashes never restore in-process test attestations or authenticated review. A snapshot is `unverified-snapshot` or `simulated-snapshot`. Pure evaluations retain the recorded report schema version and use declared canonical evidence, empty trust maps and the snapshot evaluation clock. They do not recreate receipt evidence or claim parity with recorded v2 metadata. The `pure-unverified-evaluation` scope and limitations state this narrower meaning; `get_design_system_report` returns the recorded report unchanged. List eligibility never proves human approval. Existing consumer reports without an explicit compiler record return `recordedCompile=null`. Publication, deployment, external usage and adoption stay unknown.

The loader requires clean matching Git HEAD, contained non-symlink files, matching input/artifact hashes, supported schemas and fresh timestamps. Snapshot, report, release and candidate age are capped at 24 hours with a 60-second future clock allowance. Export preserves their earliest deadline in `expiresAt`; reload and every query enforce that deadline against the current clock. Export/reload cannot extend an old report's life. A running process keeps its loaded bytes; restart with a newly exported snapshot to observe source changes.

Bounds: snapshot 8 MiB; governance/input files 4 MiB; migration documents 256 KiB; aggregate referenced inputs 32 MiB/128 files; arguments 8 KiB; stdio incoming buffer 16 KiB; query/MCP results 128 KiB. Oversized results fail explicitly rather than dropping reasons. Existing tar limits remain enforced. Declaration references and external imports other than the qualified React types are rejected before compiler analysis. The MVP supports the existing single declaration entrypoint. Source verification disables Git filesystem monitors and hooks per invocation and rejects effective clean/process filters and submodules before status inspection. Repositories using Git LFS/custom filters or submodules need a separately qualified source adapter.

Documents are returned as untrusted data. They cannot select paths, commands or execution. The readonly qualification uses guarded process/network/filesystem APIs plus before/after file inventories and static query import checks. It is a local application proof, not kernel sandboxing against a hostile same-user process or an authenticated remote service.

Cancellation is checked at the tool boundary; current pure queries are synchronous and cannot be preempted mid-computation. EOF and pre-dispatch cancellation are tested. Longer-running asynchronous work would require separate cancellation qualification.

Hosted CI, actual Codex/client activation, authenticated reviewers/npm provenance, publishing/deployment and human browser/a11y acceptance remain separate gates.
