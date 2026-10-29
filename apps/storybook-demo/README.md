# Governator Storybook demo

This is the current-product dogfood surface. It uses the workspace Storybook addon and demo UI so `bun run storybook` reflects the latest local UX. The published 0.1.0 CLI and MCP remain installed under `governator-npm-*` aliases for their separate smoke commands. The root Bun configuration disables implicit workspace linking; these local packages opt in with explicit `workspace:` dependencies.

From the repository root, install and start the demo:

```sh
bun install --frozen-lockfile
bun run dogfood:report
bun run storybook
```

The report command needs a clean, committed Git tree. The published CLI and MCP executables can also be run from the demo directory:

```sh
bun run governator:npm --help
bun run mcp:npm --help
```

This demo is workspace dogfood, not package-installation evidence. To qualify a candidate, pack the exact local addon once, preserve its digest and use the disposable npm/pnpm consumer harness. The hosted build remains read-only; local editing writes source files only when the development adapter is enabled.
