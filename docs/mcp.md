# Read-only local MCP

Governanator M2 exposes fourteen shared governance queries through a private Bun stdio application. It loads one explicitly exported snapshot. Tool calls use immutable memory; they do not execute tests, builds, packing, approvals, edits, publication or network requests.

Use Bun 1.4.2, Moon 2.6.4 and TypeScript 5.9.3. The private adapter pins MCP server 2.4.0 and Zod 4.2.1; the SDK client 2.4.0 is a workspace development dependency. Effect stays internal. The plain protocol and Storybook addon have no MCP dependency.

## Export and launch

From a clean committed checkout:

```sh
bun run build
# Explicit producer work, performed before snapshot export; executes local builds/tests.
bun run dogfood:report
bun run governanator snapshot export \
  --report artifacts/dogfood-governance.json \
  --release artifacts/dogfood-release.json \
  --config governance/release.json \
  --out artifacts/m2-snapshot.json
bun run mcp:smoke --snapshot artifacts/m2-snapshot.json
```

Export writes a new direct JSON file under ignored `artifacts/`, using exclusive creation. It never runs producers. Select a new filename when exporting again. For governance-only queries, omit both `--release` and `--config`; release/contract tools then report `not_configured`.

Manual client launch: executable `/absolute/path/to/bun`, arguments:

```text
/absolute/path/to/guvnor/packages/mcp/dist/main.mjs
--root /absolute/path/to/guvnor
--snapshot artifacts/m2-snapshot.json
```

Use the absolute Bun executable path reported by `which bun`. Startup requires both flags, validates the source and inputs, and sends failures to stderr with exit 2. Once serving, stdout contains only MCP JSON-RPC. EOF closes the transport; SIGINT/SIGTERM also close it. No client/global settings are modified automatically.

The same service is available without MCP:

```sh
bun run governanator query --snapshot artifacts/m2-snapshot.json \
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

Discovery supplies input/output schemas and read-only, non-destructive, idempotent, closed-world hints. The shared Effect schemas validate arguments again. Unknown components are typed tool errors; unknown tool names are SDK protocol errors. Blocked governance decisions are successful tool results. Results carry `snapshotDigest`, source, evaluation time, provenance, scope and limitations in `structuredContent`.

Lists accept `limit` (1–100) and `cursor` (`offset:N`), returning total, nextCursor and truncated. `list_components.filters` supports lifecycle, recorded gate and owner. Unsupported historical versions return `unavailable`; no provider lookup or guessed release history occurs.

## Provenance and bounds

Saved decisions/receipts/hashes never restore in-process test attestations or authenticated review. A snapshot is `unverified-snapshot` or `simulated-snapshot`. Pure evaluations use canonical evidence, empty trust maps and the snapshot evaluation clock. List eligibility never proves human approval. Existing consumer reports without an explicit compiler record return `recordedCompile=null`. Publication, deployment, external usage and adoption stay unknown.

The loader requires clean matching Git HEAD, contained non-symlink files, matching input/artifact hashes, supported schemas and fresh timestamps. Snapshot/report age is capped at 24 hours with a 60-second future clock allowance, checked on each query. Export/reload cannot extend an old report's life. A running process keeps its loaded bytes; restart with a newly exported snapshot to observe source changes.

Bounds: snapshot 8 MiB; governance/input files 4 MiB; migration documents 256 KiB; aggregate referenced inputs 32 MiB/128 files; arguments 8 KiB; stdio incoming buffer 16 KiB; query/MCP results 128 KiB. Oversized results fail explicitly rather than dropping reasons. Existing tar limits remain enforced. Declaration references and external imports other than the qualified React types are rejected before compiler analysis. The MVP supports the existing single declaration entrypoint.

Documents are returned as untrusted data. They cannot select paths, commands or execution. The readonly qualification uses guarded process/network/filesystem APIs plus before/after file inventories and static query import checks. It is a local application proof, not kernel sandboxing against a hostile same-user process or an authenticated remote service.

Hosted CI, actual Codex/client activation, authenticated reviewers/npm provenance, publishing/deployment and human browser/a11y acceptance remain separate gates.
