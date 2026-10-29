# Architecture

The core evaluates validated data against an explicit policy, source identity and clock. It imports no Storybook, MCP or GitHub SDK. Pure evaluation does not read the filesystem, spawn processes or obtain current time. Canonical hashing uses Bun's compatible `node:crypto` implementation; it is deterministic for JSON inputs.

The CLI is the application boundary. It loads YAML/JSON, resolves symlinks, checks files, obtains Git HEAD and injects time. Effect maps application failures into typed errors and CLI exit codes. Protocol serialization is JSON only. The Storybook manager consumes the generated JSON protocol without importing the engine or Effect. Its opt-in Vite development-server integration can edit registry metadata and descriptive tags locally; that server boundary validates inputs and writes files. Static builds provide viewing only.

## Wire contract

`packages/core/src/domain.ts` defines the internal Report schema. `bun run protocol:generate` creates the JSON Schema and immutable ordinary TypeScript types in `packages/protocol`. `bun run protocol:check` detects drift. Core output is checked against this generated type by TypeScript; runtime report roundtrip tests check the schema boundary.

No engine/Effect types appear in the protocol. `bun run boundaries` scans source and built imports and rejects protocol runtime/peer/optional dependencies, external imports and dynamic imports. Producers default to report schema 1; schema 2 is opt-in and includes selected evidence metadata. The addon and snapshot readers accept both versions and reject unsupported or malformed reports. Schema validation must be followed by the protocol's semantic validation; it does not authenticate the producer.

## Tooling

Moon discovers explicit project dependencies. Bun workspaces install/link packages and execute TypeScript. tsdown builds ESM and declaration files. The CLI and MCP bundle private workspace implementation and Effect, while retaining their declared conventional runtime dependencies; TypeScript remains external so its compiler libraries can resolve. The addon has Storybook as its sole peer and no runtime dependencies. CLI source maps are disabled because the dual executable/declaration build in the pinned tsdown emitted an upstream fake-JS sourcemap warning; this changes debugging detail, not CLI behavior.

Moon uses local caches only. No remote Moon cache or telemetry collector is configured. GitHub Actions deploys the static documentation and demo; these deployments do not run a hosted governance engine. JavaScript dependency auto-installation is disabled; dependencies are installed explicitly with `bun install --frozen-lockfile`. Bun 1.4.2 is pinned in both packageManager and Moon's toolchain. Moon may prepare its vendor runtime in the local proto cache and update its last-used timestamp; this is local tool management, not a remote service.

## Lint policy

The Effect 4 recommended preset from `@opsydyn/oxlint-effect@2.0.1` is active alongside Oxlint correctness rules, with warnings denied. Narrow overrides cover JSON serialization and malformed-input tests, literal fixture strings, and Node-compatible filesystem/crypto imports confined to the private Bun boundary. A line exception permits `new Date(explicitTimestamp)` for canonical UTC validation; domain evaluation never calls `new Date()` without an input. Error mapping is an Effect boundary; trivial pure transformations remain ordinary functions.

## Agent workflow and package map

The pure `core` and `versioning` packages evaluate policy and compatibility. `protocol` is the plain JSON/TypeScript interchange. `query` builds and loads source-bound immutable snapshots. The CLI runs application operations inside its Effect error boundary; `doctor` observes working-tree setup without producing evidence. Explicit snapshot refresh invokes the existing local producer and exports a new view; MCP sessions retain their selected snapshot until restarted.

The private source-only `operations` package owns shared registry metadata validation and authoring. Storybook's local Vite server and CLI use its revision checks. New component registration and test mapping expose preview content before explicit single-file application. These operations do not supply cross-process transactions, infer ownership, or approve lifecycle transitions. After edits, source must be reviewed and committed before evidence collection.

CSF tag parsing remains in the addon and is exposed through an optional API-1 authoring adapter. The CLI resolves an installed adapter only for an explicit tags command. It has no Storybook runtime dependency. MCP uses the shared query service and remains read-only; its tool descriptions distinguish recorded decisions from fresh producers. The onboarding skill composes these capabilities while preserving the installed version's limits.

`fixture-attestation`, `fixture-policy` and historical M3 verification documents describe synthetic experiments. They are not requirements for adopting published Governator or authority for the single-maintainer release workflow. Current user guidance lives in the Starlight tutorials, how-to guides, reference and explanations. Dated qualification records remain historical evidence.
