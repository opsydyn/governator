# M2 Read-only MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task after implementation approval. Steps use checkbox syntax.

**Status:** Approved and implemented locally on `codex/m2-readonly-mcp`. See `docs/m2-verification.md` for qualification and remaining gates. No push, publication or client activation.

**Goal:** Let an MCP client inspect component governance, contract differences, release blocks and migration guidance using the same validated reports and policy functions as the CLI and Storybook.

**Architecture:** Add a private shared query module and a private Bun stdio MCP application. Load one explicitly selected, immutable query snapshot at startup; never execute builds, tests, packing, approvals or publication in an MCP tool. Separate recorded snapshot decisions from a fresh pure policy evaluation so reading saved JSON cannot recreate the in-process attestations of a local test run.

**Tech Stack:** Existing Bun 1.4.2, Moon 2.6.4, TypeScript 5.9.3, tsdown, Changesets, Vitest, Effect Schema internally, plain generated JSON contracts; official MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, with `@modelcontextprotocol/client` for tests), stdio transport.

**Spec:** `docs/reference/CODEX_HANDOFF_DESIGN_SYSTEM_GOVERNANCE.md`, sections MCP read-only tools / M2; `docs/release-candidates.md`; `docs/release-candidates-verification.md`.

## Starting point and integration

On 27 October 2026, local main advanced by fast-forward from c753983 to f4c895c. All commits from codex/m0, codex/m1-evidence, codex/m1-storybook-contracts and codex/m1-release-candidates are included. Their branch pointers are preserved. No remote is configured and nothing was pushed or published. The implementation baseline has 114 tests in 17 files, six package builds and the real Storybook app.

Integration verification on main: all nine uncached Moon check tasks pass, including 114/114 tests. All six package build tasks pass using their unchanged cached outputs. The M2 plan is the only new tracked change in this integration turn.

Local M1 behavior is implemented: genuine test-report import/local process checks, API diff, Changesets intent, exact packed candidates, a blocked patch/minor demonstration, explicitly simulated reviewed major, and release/readiness UI with sidebar markers. Hosted CI execution and required-check settings, authenticated publisher/reviewer identity, and real visual/keyboard/a11y acceptance remain unverified. These are not prerequisites for a local read-only MCP adapter and must not be relabelled complete by M2.

## Proposed approach and alternatives

Recommended: a versioned snapshot/query layer plus stdio adapter. This keeps queries deterministic, makes parity testable and prevents an agent tool from running repository code. The builder must retain the distinction between a recorded result and newly verified evidence.

Directly calling runLocalCheck/checkCandidate from MCP would execute repository code, write artifacts and blur read-only access; exclude it. Hosted HTTP/OAuth and remote provider lookups add deployment and identity work that belongs after local MCP qualification; exclude them from M2. These are proposed engineering choices, not new user-approved implementation decisions.

## Global constraints

- Keep all work local. No push, publication, hosted resource or automatic client-configuration edits.
- Preserve Bun 1.4.2 / Moon 2.6.4 / TypeScript 5.9.3. Pin verified SDK versions when implementing; do not silently upgrade the workspace toolchain.
- MCP SDK v2 server root import and `@modelcontextprotocol/server/stdio`; client and its `/stdio` subpath are test-only. Confirm installed exports before coding.
- Effect stays private. Protocol remains plain JSON/TypeScript with no runtime dependencies. Storybook retains its sole Storybook peer, no MCP/core/Effect import, and its 128 KiB raw / 16 KiB gzip manager budget.
- No tool may run tests, build/pack, write source/artifacts, approve, version, publish, deploy, or make network calls. The caller supplies root and snapshot at process startup, never arbitrary tool-selected paths or commands.
- Saved reports, receipts and content hashes are not identity credentials. Preserve simulated/unverified labels; publication, deployment and adoption stay unknown.
- stdout is JSON-RPC only. Diagnostics use stderr. Bounded reads, cancellation, orderly EOF shutdown and typed errors are required.

## Snapshot and trust contract

The CLI gains an explicitly invoked snapshot-export command. It validates and bundles selected governance report, release report, registry/policy/evidence, API baseline/candidate, exact candidate references and migration/consumer documents. It does not invoke a new test/build run. A user who wants fresh evidence first invokes existing CLI checks; exporting their saved results never upgrades their provenance.

The bundle contains schemaVersion 1, repository/source commit, policy version, generation/evaluation times, file digests and a canonical bundle digest. Its loader enforces contained non-symlink files, a clean matching source identity, matching report/API/release scope, supported schemas and existing 24-hour freshness limits. Cap the bundle at 8 MiB, individual referenced documents at 256 KiB, and each tool result at 128 KiB with explicit pagination/truncation metadata. Do not silently truncate decision reasons. Load once into an immutable service; source changes require an explicit restart/new snapshot, and elapsed freshness is checked on each call.

A query envelope has schemaVersion, snapshotDigest, sourceCommit, evaluatedAt, provenance (`unverified-snapshot` or `simulated-snapshot`), scope, data and limitations. `reportedDecision` is an unchanged recorded engine decision, not newly authenticated eligibility. New pure evaluations use the same core evaluate function with empty verified-attestation maps; a copied receipt or approval flag cannot restore trusted context. The evaluation clock is the selected snapshot's evaluation time for deterministic parity, with current-time expiry enforced separately.

Never pass deserialized localReport into assessRelease as if it came from the fresh host runner. explain_release_block reports the recorded, scope-checked release decision. An absent release snapshot yields not_configured, not a fabricated live release check. Historical fixtures remain explicitly local; no latest-published lookup is invented.

## Tool surface

| Tool                                                                    | Behavior                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| list_components(filters?)                                               | Filter by lifecycle, recorded gate and owner; stable ID ordering and bounded pagination.                                                                                                                                              |
| get_component(componentId)                                              | Registry metadata plus separate recorded readiness/release state and provenance.                                                                                                                                                      |
| get_component_evidence(componentId)                                     | Evidence, references, checks, timestamps and missing proof; no trust promotion.                                                                                                                                                       |
| evaluate_component(componentId, targetLifecycle)                        | Pure unverified-input evaluation with explicit scope; no fresh test execution.                                                                                                                                                        |
| explain_governance_failure(componentId, targetLifecycle)                | Reasons from that same pure evaluation.                                                                                                                                                                                               |
| get_design_system_report()                                              | Unchanged report plus query provenance; exact snapshot identity.                                                                                                                                                                      |
| list_approved_components()                                              | Never imply verified human approval. Return policy-eligible candidates explicitly labelled eligible_under_local_policy/eligible_under_demo_policy, with approvalVerified=false and the actual policy scope; no generic approved=true. |
| get_component_contract(componentId, contractVersion?)                   | Select an explicit available current/baseline contract; unavailable versions are not guessed.                                                                                                                                         |
| diff_component_contract(componentId, fromVersion, toVersionOrCandidate) | Existing pinned analyzer over explicit bundled API snapshots; include scope and limits.                                                                                                                                               |
| list_breaking_changes(packageId?, sinceVersion?)                        | Known major changes from available diffs; unsupported history is unavailable, not an empty success.                                                                                                                                   |
| explain_release_block(packageId, candidateVersion)                      | Recorded exact candidate gate/reasons/digests; never rerun the producer.                                                                                                                                                              |
| get_release_manifest(packageId, version)                                | Available immutable local baseline/candidate metadata, explicitly not publication proof.                                                                                                                                              |
| get_consumer_compatibility(packageId, candidateVersion)                 | Observed local fixture results and known/inferred/unknown usage; no invented adoption.                                                                                                                                                |
| plan_component_migration(componentId, fromVersion, toVersion)           | Deterministic guidance from actual changes and bundled documents; observed files versus suggested actions distinguished. No edits.                                                                                                    |

All tools are annotated readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false. Annotations describe behavior; tests must prove the restrictions.

## Review focus

1. Recorded ready/demo decisions must never become newly verified approval or publish authorization.
2. Source/input/artifact mismatch, changed bytes, stale snapshots and unavailable version history must fail closed or report unavailable.
3. File traversal, symlinks, oversized inputs, prompt-like document content and malformed filters must not trigger execution or reveal unrelated files.
4. CLI, Storybook and MCP must agree for the same snapshot/query scope; live producer checks are a different scope and cannot be silently substituted.
5. Stdio framing, errors, cancellation and EOF must work under Bun without stdout logging or leaked child processes.

## Task 1 — Shared query contracts and immutable loader

**Files:** Create `packages/query/src/{domain,snapshot,service,index}.ts`, package/tsdown/Moon files; modify `.moon/workspace.yml`, root build aliases and protocol generator; tests `tests/query-snapshot.test.ts` and `tests/query-service.test.ts`.
**Interfaces:** `loadSnapshot(root, path, now): Promise<QuerySnapshot>` owns bounded reads; `createQueryService(snapshot): QueryService` is immutable and IO-free. Domain request/response schemas generate plain protocol types. Server has no caller-controlled filesystem API.

- [x] Write failing tests: valid selected snapshot loads unchanged; wrong source/inputs/version/time/hash, traversal, symlink and oversized bundle/document reject; snapshot reading creates no reusable attestations.
- [x] Run those tests RED; implement loader and schemas, preserving all source provenance.
- [x] Test query ordering/filter/pagination, unknown component, empty registry and unchanged recorded decisions. Implement the shared read service.
- [x] Verify `bun run check`, protocol freshness and dependency boundaries. Commit the independently testable query layer.

## Task 2 — Governance, contract and migration query parity

**Files:** `packages/query/src/{governance,contracts,migrations}.ts`; `packages/cli/src/{snapshot,query}.ts` and CLI dispatch/help; tests `tests/query-parity.test.ts`, `tests/query-cli.test.ts`.
**Interfaces:** `exportSnapshot(root, inputs, out)` explicitly writes a selected bundle; `querySnapshot(service, name, args)` returns the versioned envelope. Reuse core evaluate/diffApi; no duplicate bump or policy evaluator.

- [x] Write RED tests for all 14 tools' semantic behaviors in the table, including unavailable history/provider data and simulated review labels.
- [x] Implement queries and CLI `snapshot export` / `query` wrappers with contained inputs and explicit flags. Preserve existing evaluate/check/release syntax.
- [x] Assert byte-equivalent report bodies and equal gate/reasons/digests for CLI query, Storybook's snapshot projection and shared service. Compare pure evaluate_component to CLI evaluate at identical inputs/clock, not to a different fresh-test context.
- [x] Test no broad approved label under the unit-only dogfood policy; incomplete/stale data never becomes success. Run full checks and commit.

## Task 3 — Bun MCP SDK v2 stdio application

**Files:** Create `packages/mcp/src/{server,tools,main}.ts`, private package/build/Moon files; tests `tests/mcp-{tools,stdio}.test.ts`; update root scripts/build and boundary guard.
**Interfaces:** `createMcpServer(service)` registers only the 14 query tools; `main.ts --root PATH --snapshot PATH` loads once and serves stdio. `--help` goes to the normal CLI before transport starts. No default filesystem search or implicit report generation.

- [x] Inspect published/installed SDK v2 exports, peer requirements and schema adapter. Pin exact compatible server/client versions; verify a minimal real client/server exchange under existing Bun/TypeScript before introducing domain handlers. If compatibility fails, document the concrete blocker without a silent toolchain upgrade.
- [x] Write RED SDK-client tests for discovery, argument/result schema, semantic errors, query parity and readonly annotations.
- [x] Implement the thin transport/schema adapter. Keep transport schema glue private; core validation remains Effect Schema. SDK/client code must not enter browser/protocol packages.
- [x] Exercise built Bun stdio process: initialize/list/call, parallel calls, invalid input, unknown tool, cancellation and EOF. Assert stdout contains only protocol messages and the process exits without orphaned children.
- [x] Run full checks/build/boundaries and commit.

## Task 4 — Local qualification and operator handoff

**Files:** `scripts/mcp-smoke.ts`, `docs/{mcp,m2-verification}.md`; extend readonly local CI qualification; add appropriate private-package Changeset without versioning/publishing.
**Interfaces:** smoke script is an explicitly invoked operator test, using the SDK client against built stdio server and a selected real dogfood snapshot.

- [x] Hash/inventory source, snapshot, artifacts and candidate bytes before/after all read tools. Assert no writes, build/test/pack invocation or network access. Exercise missing evidence, stale snapshot, wrong SHA/digest, simulated major, blocked patch/minor and unavailable consumers.
- [x] Run an actual SDK-client smoke against the real app's generated report and exact release snapshot. Confirm lifecycle, release eligibility/reasons and migration references match the CLI query and Storybook snapshot scope.
- [x] Repeat addon boundary/budget checks to show MCP has not leaked into its install surface. Run full Moon checks, all builds and the local qualification commands; keep hosted status unobserved.
- [x] Document a manual client launch command. Do not edit Codex/client global MCP settings or claim host integration without a separately requested/observed connection.
- [x] Obtain one independent whole-branch review; fix Important issues with observed regressions. Commit locally and stop before push/publication.

## Exit criteria and later work

M2 is locally complete when an actual MCP SDK client can query all supported tools over built Bun stdio, identical scoped inputs produce matching CLI/Storybook/MCP conclusions, every unsupported trust/provider state stays honest, and readonly behavior is demonstrated by filesystem/process/network evidence. Plan-only commits do not satisfy this exit.

M3 remains separate: trusted reviewer identities, authenticated npm provenance, real publishing/deployment/adoption, hosted activation/branch protection, broader package entrypoints and deeper visual/token/a11y/consumer analysis. Existing historical SemVer-prefix and Vitest summary-counter minors are not silently included in M2; revisit only if they affect its actual query boundary.

## Primary references checked for this plan

- [Official SDK v2 overview](https://ts.sdk.modelcontextprotocol.io/v2/) — supported runtime and server/client split.
- [Packages and subpaths](https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages) — server/client stdio imports and runtime separation.
- [Server package source](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/README.md) — v2 stable line. Exact versions must be verified and pinned at implementation time; no dependencies were installed during planning.
