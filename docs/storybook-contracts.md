# Storybook dogfood and API contracts

Run `bun run build`, then `bun run dogfood:report` on a clean committed tree. The script checks tracked inputs, rebuilds UI declarations without Moon's cache, checks manifest/config/registry versions agree, runs actual mapped Vitest component tests and checks HEAD again. Output is ignored local data at `apps/storybook-demo/public/governance-report.json`, mirrored in `artifacts/dogfood-governance.json`; raw test output and receipts are retained under `artifacts/governanator-run-*`. Receipts are audit records, not signatures.

Start `bun run storybook`; select a canvas story and **Governance**. The panel reads the same JSON that the evaluator produced. Optional schema-v1 compatibility details add API/bump results without changing readiness. `contracts diff` independently returns the same compatibility result for the baseline and `artifacts/dogfood-api-candidate.json`. The shared package gate reflects the maximum requirement across components, so a breaking Button change blocks the package for Alert consumers too.

The local policy intentionally requires only real unit evidence. The component SSR tests verify native Button, labelled Select and Alert semantics. This does not prove browser interaction, automated accessibility, visual regression or human approval. Select's prerelease contract cannot meet stable; deprecated LegacyAlert cannot move back to stable.

## Baseline discipline

`fixtures/releases/ui-8.4.1/src` is the preserved source of the local prior release fixture. Its Button has `tone`; current source has `variant`. The checked-in API baseline was created from its actual tsdown declarations with pinned TypeScript 5.9.3. Reproduce the declarations with `bun --bun tsdown --config fixtures/releases/ui-8.4.1/tsdown.config.ts`. `scripts/snapshot-demo-baseline.ts` refuses to overwrite an existing baseline. A hash proves fixture integrity, not publication or publisher identity.

Contracts snapshot/diff commands accept contained files through the normal CLI path guards. Snapshot metadata is recomputed from declaration text during decoding to reject forged prop mirrors. Explicit unresolved declarations, malformed configuration, mismatched compiler versions/digests and global/module augmentations fail closed. Hidden parameter shapes, generic/unsupported call signatures and return changes require explicit review. Static analysis is conservative and is not a complete proof of TypeScript or behavioral compatibility.

## Addon distribution and report boundary

The addon only peers on `storybook`; it ships no CLI, engine, Effect, Node or MCP dependency. Native Storybook manager APIs provide React. The addon uses classic JSX to avoid bundling a renderer-specific JSX runtime against Storybook's manager React. React/Vite 10.6.4 is the qualified renderer; other renderers are unqualified.

The report URL must use same-origin HTTP(S), with no credentials, credentials omitted from fetch and redirects rejected. Schema/version validation runs in a generated standalone browser validator. Duplicate IDs, noncanonical/future times, malformed/unsupported reports, errors and reports older than 24 hours do not display ready status. An unknown component displays onboarding. The report author must still be trusted: JSON schema validation cannot authenticate a snapshot or independently reconstruct its evidence.

`bun run addon:validator` regenerates the validator from the plain protocol schema. `bun run addon:check` checks freshness, source/shipped imports, no runtime dependencies, sole Storybook peer and a 128 KiB raw / 16 KiB gzip manager budget. The generated Ajv source uses a compile-time helper that tsdown bundles; the shipped bundle may not require that helper externally.

## Remaining work

Changesets intent validation, a source-bound exact packed release candidate, authenticated published release baselines and major-review/migration requirements remain open M1 work. Package-level compatibility here is a preliminary static API/version check. No hosted CI, release, publication, MCP, external approval or deployment was added. Native Storybook story tags are present; governance-derived sidebar filtering is deferred.
