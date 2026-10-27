---
title: Export and serve an MCP snapshot
description: Create a fresh immutable query view and launch the read-only stdio adapter.
---

Start from the clean, committed source checkout with Bun 1.4.2 and installed dependencies. Complete the [local dogfood tutorial](/tutorials/local-dogfood/) to produce report/release artifacts and build the adapter.

```sh
bun run governanator snapshot export \
  --report artifacts/dogfood-governance.json \
  --release artifacts/dogfood-release.json \
  --config governance/release.json \
  --out artifacts/mcp-snapshot.json
bun run mcp:smoke --snapshot artifacts/mcp-snapshot.json
```

Output must be a new direct JSON file beneath ignored `artifacts/`. Export never runs tests/builds or overwrites a snapshot. For governance-only export omit both `--release` and `--config`; release/contract queries then return `not_configured`.

For a manual client, obtain the absolute Bun executable with `which bun`. Configure that executable and these arguments, replacing checkout paths:

```text
/absolute/path/to/guvnor/packages/mcp/dist/main.mjs
--root
/absolute/path/to/guvnor
--snapshot
artifacts/mcp-snapshot.json
```

Both flags are required. Startup validation failures exit 2 on stderr; serving stdout is reserved for MCP JSON-RPC. EOF, SIGINT or SIGTERM close the transport. Client/global settings are not changed by these instructions.

To inspect without an MCP client:

```sh
bun run governanator query --snapshot artifacts/mcp-snapshot.json \
  --tool get_component --args '{"componentId":"ui.button"}'
```

Export/reload/query enforce the earliest deadline, capped at 24 hours with a 60-second future clock allowance. A running process keeps immutable loaded bytes. After source or report changes, produce new evidence, export a fresh filename and restart. Re-exporting old evidence does not renew it. See [tools and bounds](/reference/mcp-tools/) and [trust](/explanation/evidence-and-trust/).
