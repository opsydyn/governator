# Consumer distribution — local verification

Date: 2026-10-27. This records local qualification of the `0.1.0` private preview against the [distribution design](../superpowers/specs/2026-10-27-consumer-distribution-design.md). It does not authorize publication.

## Requalification after the Governator rename

On 2026-10-28, independent local consumers exercised packages built from source commit `20c46a088424423e9cf044e083453588f5d764fa`. This is a separate result from the earlier qualification below. The following SHA-256 hashes identify the local candidate archives, not npm registry artifacts:

| Package                       | Local tarball SHA-256                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| `@governator/cli`             | `76965de599eaf244668729ff7fe4854e96698f2e04d44ea3809a53d667e928c4` |
| `@governator/mcp`             | `9f01315fa01aea181c1c7c0aa51b96e71bcc556351f351e9b34516cd0e78de56` |
| `@governator/storybook-addon` | `e20d50cbd9761871193c242527f1a4866d0971797dc776fb9a809f93de262c2c` |

The npm CLI/MCP consumer installed both tarballs outside the workspace, ran the installed `governator` executable, produced a schema-2 report and local test receipt, exported a snapshot, checked a breaking TypeScript API diff and compared all fourteen MCP tool results with the CLI. Invalid MCP startup failed as expected and the consumer Git tree remained clean. The installed dependency lock retained 24 unresolved optional platform entries; those platforms were not qualified.

Separate npm and strict-peer pnpm consumers installed a freshly built addon tarball and built Storybook React/Vite 10.6.4 both without a report and with a copied local schema-2 dogfood report. Browser checks in each consumer observed the unverified no-report panel and, with the copied report, the unverified provenance and expected blocked release and API compatibility results. These checks do not authenticate the report, approve a release or establish production use.

Both harnesses proved loopback connectivity and an `EPERM` denial for an external-address probe before installation. They disabled lifecycle scripts and used isolated consumer directories, caches and a loopback registry reconstructed from the local Bun cache. The pnpm install warned that reconstructed metadata lacks publication times, so minimum-release-age checks were skipped; Storybook reported chunks larger than 500 kB. Reconstructed archives do not establish original npm archive integrity, registry availability or scope ownership. Hosted CI, provider authentication, publication and deployment remain unqualified.

Detailed local, ignored evidence is retained under `artifacts/cli-mcp-consumer-BMVLAp/`, `artifacts/addon-consumer-85by802l/` and `artifacts/governator-rename-candidates-IcuRgI/`. Harness summaries record the automated cases; the browser observations above were performed separately and do not modify those summaries. Temporary browser servers were stopped after the checks.

## Package surfaces

The CLI and MCP retain their executables and programmatic exports, require Bun `>=1.4.2`, bundle the private engine and Effect, and declare their remaining runtime dependencies. TypeScript stays external so its compiler libraries resolve in consumer projects. Public declarations and runtime imports were checked for private workspace or Effect leaks. The addon has no runtime dependencies, retains Storybook as its only peer and advertises React, the qualified framework. The CLI includes its MIT license. All packages remain private; the root release command and release workflow remain disabled.

## Independent consumers

- CLI and MCP candidates packed from `ef98b98` were installed in an independent, clean Git project using npm and a loopback-only source reconstructed from extracted Bun cache. The installed CLI ran evaluation, a real Vitest 4.1.12 schema-2 check and receipt, snapshot export, and a TypeScript library-aware compatibility diff that correctly reported a breaking change. The installed MCP server exposed fourteen tools whose results matched installed CLI queries. Invalid startup failed as expected; the saved snapshot remained unverified, and publication and deployment remained unknown. Twenty-four unresolved optional platform lock entries were not installed or qualified.
- The addon was freshly built into temporary output, staged and packed without changing the repository's existing `dist`. Its SHA-256 was `120b5b7b791cc3d618ca199ca282052848b86ab4ccd558b1fa7999d47e74a0d7`. Separate npm and strict-peer pnpm consumers installed it and built Storybook React/Vite 10.6.4 with no report and with a copied schema-2 fixture. In the local browser, both consumers showed an unverified no-report state and displayed the copied fixture's evidence; the fixture is not authenticated approval or publication evidence.
- The consumers used isolated caches, retained original dependency manifests, disabled lifecycle scripts and used an OS-enforced loopback-only profile. A localhost probe connected and an external-address probe failed with `EPERM`. Dependency archives were reconstructed from extracted Bun cache; their hashes do not authenticate original npm registry archives. The pnpm run logged 158 warnings because reconstructed metadata lacks publication times and package-age checks were skipped. The Storybook builds warned of chunks over 500 kB.

## Checks and limits

On `a95f110`, the full local check passed **637 tests across 48 files** and all nine Moon tasks. All 11 build targets passed from cache; strict declaration checks and publint also passed. A later main-check attempt exposed stale MCP declarations in an older checkout. At `fa49198`, a forced check with CLI/MCP output absent rebuilt both before typecheck and tests, then passed **637 tests across 48 files** and all 15 tasks; an unforced check restored missing outputs from cache. This verifies ordering and missing-output recovery, not arbitrary corruption detection. Separate local registry and addon qualification harness suites passed 18 and 6 tests respectively. The build guard was independently reviewed and tested against linked output and ancestor paths. A linked-worktree index-path fix was independently reviewed, and a source-bound MCP smoke passed with fourteen tools. Task reviews and the whole-branch review found no remaining actionable findings after fixes. Detailed command logs, lockfiles, hash manifests and consumer evidence are retained locally under `artifacts/` and are not published.

The tests establish local macOS consumer behavior for the recorded packages, not registry availability or integrity, lifecycle-script execution, other platforms, other Storybook renderers, screen-reader acceptance, hosted CI, real reviewer approval or deployment. npm scope ownership, the real remote and protected publishing workflow still require separate qualification.

During an early temporary bundling experiment, a clean operation followed symlinks and removed tracked files and freshly installed dependencies from the isolated checkout. The tracked files were restored byte-for-byte from its clean HEAD, dependencies were reinstalled from the offline cache, and the 600-test baseline passed afterward. The original main checkout's source and installed TypeScript package were checked intact. Later build guards and qualification staging avoid that cleanup path.

One initial npm packing attempt tried to contact npm's update service and failed DNS before any successful external fetch. The final consumer qualification disabled the notifier and used the verified loopback-only profile described above.
