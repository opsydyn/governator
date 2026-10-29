# Governator Storybook demo

This demo uses the published 0.1.0 addon, CLI and MCP packages from npm. The `governator-npm-*` aliases keep those dependencies distinct from the monorepo's source packages. The root Bun configuration disables implicit workspace linking; explicit `workspace:` dependencies such as the demo UI still use local source. The Bun lockfile records the published package integrity hashes.

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

The demo exercises the last published version, not changes to the workspace addon. Update the pinned versions deliberately when testing another release.
