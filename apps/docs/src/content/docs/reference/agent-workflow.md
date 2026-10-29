---
title: Agent workflow interfaces
description: Discover setup, plan source edits, collect evidence and refresh an agent's governance context.
---

These interfaces are source additions after the published 0.1.0 release. Build the source packages to use them. The published demo remains pinned to 0.1.0 and does not acquire new behavior from workspace builds. Automated source and packed-consumer qualification has passed for the local 0.2.0 candidate; manual first-user acceptance and npm publication remain separate, open gates.

## Diagnose the project

```sh
bun run governator doctor --root . --format json --report artifacts/governance.json --snapshot artifacts/governance-snapshot.json
```

Doctor reads canonical configuration, dependency resolution, Git state and selected artifacts. It runs no producers and writes no files. Its schema-1 response contains `sourceCommit`, `scope: working-tree-diagnostics`, `evidenceProduced: false` and findings with IDs, status and remediation descriptions. Dependency resolution reports paths; it does not execute packages or prove their compatibility. Report diagnostics validate structure, source and time but cannot recreate producer trust. Snapshot diagnostics use the full existing loader, including input digests and expiry; a dirty checkout is reported as needing attention. Omitted artifacts are explicitly unassessed. Dependencies can be installed in a child workspace, so an unresolved root dependency may require choosing that workspace or inspecting its setup.

Exit 1 means attention is needed. Diagnostics do not approve components. Keep lifecycle, readiness, API compatibility and release eligibility distinct.

## Register a component and map its tests

Prepare a contained JSON file with the complete component object. Use actual ownership, source paths and story paths. The registry must already exist; use the onboarding guide for initial configuration.

```sh
bun run governator registry plan --fields artifacts/new-component.json
bun run governator registry register --fields artifacts/new-component.json --revision HASH_FROM_PLAN
bun run governator mapping plan --component ui.example --files artifacts/test-files.json
bun run governator mapping update --component ui.example --files artifacts/test-files.json --revision HASH_FROM_MAPPING_PLAN
```

`--files` points to a JSON array of repository-relative test paths. Plans return `before`, `after`, `path` and the SHA-256 `revision` of the current file. Inspect the proposed content before applying. Application recomputes the plan and requires the current revision. Duplicate component IDs, missing source/story/test files and invalid registry/mapping values fail. Each operation writes one file; registration and mapping are separate changes, not a multi-file transaction. A registration may succeed while a later mapping fails: inspect and finish or revert the diff before producing evidence.

Use `--root`, `--registry` and `--mapping` to select non-default files. New registry creation, ownership inference and policy selection are outside these operations.

## Edit existing metadata

`registry inspect` requires `--story-map`, `--story` and `--component`. Supply an existing server-generated story map; `--working-dir` selects the Storybook project relative to the repository root. Inspection returns the current component and revision. `registry update` adds `--revision` and `--fields`, where fields is a contained JSON file holding the complete proposed component. Preserve the selected story. This uses the same editor as Storybook, including schema, path, story and revision checks.

## Edit descriptive tags

The CLI loads an optional installed addon adapter only for tag commands. Install a source-built addon version exposing `./authoring` API 1 in the target project. Published 0.1.0 does not expose this new adapter. Ordinary CLI consumers need no Storybook dependency.

```sh
bun run governator tags inspect --story-path ./src/Button.stories.tsx
bun run governator tags plan --story-path ./src/Button.stories.tsx --tags artifacts/tags.json
bun run governator tags update --story-path ./src/Button.stories.tsx --tags artifacts/tags.json --revision HASH_FROM_PLAN
```

The tags file is a JSON string array. An optional `--adapter` selects an installed package alias. The adapter uses Storybook's CSF parser and existing literal-metadata editing rules. Protected Storybook tags are preserved; reserved descriptive tags, unsupported source shapes and revision conflicts fail. Tags organize components and never approve readiness or releases. Installed adapters execute with the local operator's trust, like other project tooling.

## Refresh evidence and snapshots

After reviewing and committing source changes, an explicitly invoked refresh runs the configured test mapping and writes a new report and snapshot:

```sh
bun run governator snapshot refresh --mapping governance/tests.json --out artifacts/next-snapshot.json
```

Refresh executes tests. When test execution is deferred, stop before this command; diagnostics and edit planning remain available. The output path must be a new direct JSON file in ignored `artifacts/`. Refresh produces a governance-only snapshot. For release/contract queries, use the existing combined report/release workflow and explicit `snapshot export --release ... --config ...`; refresh rejects these flags before running producers.

Snapshot creation success does not mean every component is ready. Query the resulting decisions, then restart MCP with the returned path. Existing MCP sessions keep their original immutable view. Snapshot export alone never refreshes evidence or extends its original lifetime.

The development MCP exposes `list_ready_components`; `list_approved_components` remains a compatibility alias with identical data and `approvalVerified: false`. Source edits, readiness, human approval and publication are separate decisions.

## Start a new project

`init plan --config setup.json` takes an explicit JSON setup selection with exactly three fields:

| Field      | Contract                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `registry` | Schema-1 component registry, with at least one explicit owner per component and existing contained source/story paths. |
| `policy`   | The maintainer's explicit policy document; no permissive policy is inferred.                                           |
| `mapping`  | Schema-1 nonempty test mapping referencing registered components and existing test files.                              |

These are the same canonical documents described in the CLI quick start. Existing configuration should use the authoring commands instead of init.

```sh
bun run governator init plan --config setup.json
bun run governator init apply --config setup.json --revision DIGEST_FROM_PLAN
```

The plan contains the exact proposed contents of `governance/components.yaml`, `governance/policy.yaml` and `governance/tests.json`. Apply recomputes and verifies the root-bound plan digest. Existing destination files are rejected; parents must be real directories. Neither command invents ownership, installs dependencies, changes Git ignores, commits source or runs tests. Ensure generated `artifacts/` is ignored before evidence production.

Creation uses exclusive file writes. It is not a multi-file transaction: a permission or disk failure can leave a partial setup. Inspect those files before cleanup or resuming; repeated init does not overwrite them. The checks do not claim isolation from another process modifying paths concurrently.

## Export the bundled onboarding skill

The development CLI package bundles the skill and its setup reference, so export works without a repository checkout or network access:

```sh
bun run governator skill export --out .agents/skills/governator-onboarding
```

Choose the location supported by your agent client. The destination must be a new contained directory below `--root`; existing destinations and symlinked parents are rejected. Export does not activate the skill or change global client settings. Like setup, a disk failure may leave partially created files for inspection.

## Discover installed capabilities

```sh
bun run governator capabilities --format json
```

The schema-1 response lists package version, command names, accepted options, required options, supported data-schema versions, MCP tools, authoring adapter requirements and command effects. Command names/options are collected from the same Effect command tree used by the parser. Effect labels distinguish read operations, source edits, artifact writes and producer execution. Discovery does not execute those commands or assess project readiness; installed optional adapter presence is checked when a tag command is invoked.

Doctor supports `--workflow cli` (default), `evidence`, `storybook` or `mcp`. Missing optional integrations are `optional`; omitted optional artifact selections are `unassessed`. Neither status causes exit 1. Evidence requires Vitest, Storybook requires its addon and peer, and MCP requires its server package and selected snapshot. Dependency manifests are inspected only in the selected project's dependency ancestry, avoiding aliases from the CLI's own workspace. Resolution alone does not prove executable compatibility.

Attention findings include remediation descriptions. When an exact read-only command is appropriate, they include an `executable`, argument array and effects; consumers should pass arguments directly, not construct shell commands. Suggestions are never executed automatically. Source edits, dependency installation and producer execution still follow the user's authorization.
