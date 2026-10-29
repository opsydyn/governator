# Agent-native automated qualification

Automated qualification of the agent workflow implementation at local source commit `7dcfa8a`. Manual acceptance is deferred. No publishing, versioning or deployment was performed.

## Workspace checks

`bun run check` passed all 18 Moon tasks: 825 tests across 79 files, TypeScript, lint, formatting, generated protocol freshness, package boundaries, addon validator and manager budget, documentation typechecking/build/internal links, and CLI help.

New regression coverage checks read-only registration plans, replacement references, duplicate IDs, missing and symlinked paths, mapping JSON compatibility, stale-write rejection, CLI registration/mapping routes, optional tag adapter preview/application/protected tags, working-tree diagnostics, stale reports and snapshots, and ready-components alias parity. Snapshot refresh runs a real mapped producer in a disposable repository and rejects overwrites and source-mutating producers.

The first full run exposed stale MCP discovery lists, missing isolated-install dependencies in disposable release-demo clones, and an active Changeset omitted from the dogfood release config. Those were corrected; the final full run passed, including the committed-source clone test.

## Independent packed consumers

The CLI and MCP archives passed `scripts/qualify-cli-mcp.ts`. Evidence is retained in ignored `artifacts/cli-mcp-consumer-cLLcPW/summary.json`. The rehearsal exercises real installed executables, report/snapshot production, immutable MCP stdio, all fifteen query tools and CLI parity. The ordinary CLI/MCP dependency graph does not install Storybook.

The addon archive passed independent npm and strict-peer pnpm installs and no-report Storybook builds through `scripts/qualify-addon.py`. Evidence is retained in ignored `artifacts/addon-consumer-zojxhjqp/summary.json`. Both consumers contain their own installed package graph with contained symlinks. These are build results, not browser interaction or screen-reader evidence.

An additional automated cross-package check invoked the packed CLI against each independent addon consumer. Tag planning left source unchanged, the revision-checked update succeeded, and inspection returned the requested descriptive tag. Output is retained in `artifacts/addon-consumer-zojxhjqp/packed-authoring.txt`.

Archives were packed once from the previously built agent implementation (the observed checkout was `e15ec79` at packing). Subsequent source changes in this qualification concerned tests, release-demo isolation and the dogfood release config. These archives retain version 0.1.0 locally; they are not the published 0.1.0 bytes or a versioned next-release candidate.

The consumer rehearsals used confined loopback registries and third-party archives reconstructed from extracted Bun cache with preserved manifests. This qualifies the tested local consumer graphs, not original registry integrity, live npm publishing or every supported platform. Raw ignored evidence and temporary consumers must be preserved separately if needed beyond this checkout.

## Remaining acceptance

- Real-browser visual, keyboard and accessibility walkthrough of the addon and editors.
- Human onboarding using the portable skill, including ownership/policy decisions.
- Versioned next-release candidate capture and its final qualification before any separately authorized publication.

Automated rendered-UI and HTTP tests passed as part of the suite. They do not replace manual acceptance. The monorepo demo remains pinned to the already-published 0.1.0 packages.
