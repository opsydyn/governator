# Release conventions

The reference is [opsydyn/oxlint-effect](https://github.com/opsydyn/oxlint-effect): Bun install/build, tsdown ESM and declarations, Changesets version/release PRs, `changeset publish`, `publishConfig.access: public` and `provenance: true`. Its current release workflow uses `changesets/action` and npm token authentication (`NPM_TOKEN`/`NODE_AUTH_TOKEN`) plus GitHub OIDC permission. The reference manifest/workflow were inspected during implementation.

Governator adopts those build/config conventions. `bun run changeset` creates release intent, `bun run version` applies it locally, while `bun run release` deliberately fails closed through `scripts/publish-disabled.ts` and never publishes. None of those mutating release commands was run during M0. Packages are independently versioned. The addon, CLI and MCP are public release candidates; other workspace packages remain private. The first release uses the @opsydyn scope.

`.github/workflows/release.yml` is a manually dispatched workflow for the retained 0.1.0 archives. It verifies archive hashes and GitHub attestations, checks npm authentication and existing versions, and offers a dry run before publication. It reads each published archive back from npm and stops on an error. If a run is interrupted or partially succeeds, inspect all three npm versions before taking any further action; do not blindly rerun it.

Internal workspaces and Effect remain bundled CLI/MCP implementation details; retained conventional runtime dependencies must resolve independently. Before release, inspect the actual packed JavaScript and declarations and run independent CLI/MCP consumers plus clean npm/pnpm Storybook React/Vite installations and dependency/bundle budget gates. Record exact results and package-source provenance: local caches or reconstructed sources do not prove real registry installation. Missing offline dependencies leave qualification gates open. See the [consumer distribution plan](superpowers/plans/2026-10-27-consumer-distribution.md).

Changesets manages package intent; the component governance engine must independently enforce compatibility and required migration/review proof in M1. A Changeset alone is never approval.

## Local exact candidate gate

Changesets intent and exact candidate validation are implemented in the [release runbook](release-candidates.md). Local qualification never authorizes publication. The root release command remains disabled; the manual workflow handles the selected first-release archives.
