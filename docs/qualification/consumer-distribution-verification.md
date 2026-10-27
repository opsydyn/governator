# Consumer distribution — local verification

Date: 2026-10-27. This records local qualification of the `0.1.0` private preview against the [distribution design](../superpowers/specs/2026-10-27-consumer-distribution-design.md). It does not authorize publication.

## Package surfaces

The CLI and MCP retain their executables and programmatic exports, require Bun `>=1.4.2`, bundle the private engine and Effect, and declare their remaining runtime dependencies. TypeScript stays external so its compiler libraries resolve in consumer projects. Public declarations and runtime imports were checked for private workspace or Effect leaks. The addon has no runtime dependencies, retains Storybook as its only peer and advertises React, the qualified framework. The CLI includes its MIT license. All packages remain private; the root release command and release workflow remain disabled.

## Independent consumers

- CLI and MCP candidates packed from `ef98b98` were installed in an independent, clean Git project using npm and a loopback-only source reconstructed from extracted Bun cache. The installed CLI ran evaluation, a real Vitest 4.1.12 schema-2 check and receipt, snapshot export, and a TypeScript library-aware compatibility diff that correctly reported a breaking change. The installed MCP server exposed fourteen tools whose results matched installed CLI queries. Invalid startup failed as expected; the saved snapshot remained unverified, and publication and deployment remained unknown. Twenty-four unresolved optional platform lock entries were not installed or qualified.
- The addon was freshly built into temporary output, staged and packed without changing the repository's existing `dist`. Its SHA-256 was `120b5b7b791cc3d618ca199ca282052848b86ab4ccd558b1fa7999d47e74a0d7`. Separate npm and strict-peer pnpm consumers installed it and built Storybook React/Vite 10.6.4 with no report and with a copied schema-2 fixture. In the local browser, both consumers showed an unverified no-report state and displayed the copied fixture's evidence; the fixture is not authenticated approval or publication evidence.
- The consumers used isolated caches, retained original dependency manifests, disabled lifecycle scripts and used an OS-enforced loopback-only profile. A localhost probe connected and an external-address probe failed with `EPERM`. Dependency archives were reconstructed from extracted Bun cache; their hashes do not authenticate original npm registry archives. The pnpm run logged 158 warnings because reconstructed metadata lacks publication times and package-age checks were skipped. The Storybook builds warned of chunks over 500 kB.

## Checks and limits

On `a95f110`, the full local check passed **637 tests across 48 files** and all nine Moon tasks. All 11 build targets passed from cache; strict declaration checks and publint also passed. Separate local registry and addon qualification harness suites passed 18 and 6 tests respectively. The build guard was independently reviewed and tested against linked output and ancestor paths. A linked-worktree index-path fix was independently reviewed, and a source-bound MCP smoke passed with fourteen tools. Task reviews and the whole-branch review found no remaining actionable findings after fixes. Detailed command logs, lockfiles, hash manifests and consumer evidence are retained locally under `artifacts/` and are not published.

The tests establish local macOS consumer behavior for the recorded packages, not registry availability or integrity, lifecycle-script execution, other platforms, other Storybook renderers, screen-reader acceptance, hosted CI, real reviewer approval or deployment. npm scope ownership, the real remote and protected publishing workflow still require separate qualification.

During an early temporary bundling experiment, a clean operation followed symlinks and removed tracked files and freshly installed dependencies from the isolated checkout. The tracked files were restored byte-for-byte from its clean HEAD, dependencies were reinstalled from the offline cache, and the 600-test baseline passed afterward. The original main checkout's source and installed TypeScript package were checked intact. Later build guards and qualification staging avoid that cleanup path.

One initial npm packing attempt tried to contact npm's update service and failed DNS before any successful external fetch. The final consumer qualification disabled the notifier and used the verified loopback-only profile described above.
