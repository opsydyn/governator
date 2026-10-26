# Architecture

The core evaluates validated data against an explicit policy, source identity and clock. It imports no Storybook, MCP or GitHub SDK. Pure evaluation does not read the filesystem, spawn processes or obtain current time. Canonical hashing uses Bun's compatible `node:crypto` implementation; it is deterministic for JSON inputs.

The CLI is the application boundary. It loads YAML/JSON, resolves symlinks, checks files, obtains Git HEAD and injects time. Effect maps application failures into typed errors and CLI exit codes. Protocol serialization is JSON only. A future Storybook addon must not import the engine or Effect.

## Wire contract

`packages/core/src/domain.ts` defines the internal Report schema. `bun run protocol:generate` creates the JSON Schema and immutable ordinary TypeScript types in `packages/protocol`. `bun run protocol:check` detects drift. Core output is checked against this generated type by TypeScript; runtime report roundtrip tests check the schema boundary.

No engine/Effect types appear in the protocol. `bun run boundaries` scans source and built imports and rejects protocol runtime/peer/optional dependencies, external imports and dynamic imports. Protocol schema version 1 is the sole supported version in M0; the future addon must explicitly handle incompatible reports.

## Tooling

Moon discovers explicit project dependencies. Bun workspaces install/link packages and execute TypeScript. tsdown builds ESM and declaration files, keeping workspace dependencies external. CLI source maps are disabled because the dual executable/declaration build in the pinned tsdown emitted an upstream fake-JS sourcemap warning; this changes debugging detail, not CLI behavior. Other package builds retain maps.

Moon uses local caches only. No remote cache, telemetry collector, hosted service or deployment was configured. JavaScript dependency auto-installation is disabled; dependencies are installed explicitly with `bun install --frozen-lockfile`. Bun 1.4.2 is pinned in both packageManager and Moon's toolchain. Moon may prepare its vendor runtime in the local proto cache and update its last-used timestamp; this is local tool management, not a remote service.

## Lint policy

The Effect 4 recommended preset from `@opsydyn/oxlint-effect@2.0.1` is active alongside Oxlint correctness rules, with warnings denied. Narrow overrides cover JSON serialization and malformed-input tests, literal fixture strings, and Node-compatible filesystem/crypto imports confined to the private Bun boundary. A line exception permits `new Date(explicitTimestamp)` for canonical UTC validation; domain evaluation never calls `new Date()` without an input. Error mapping is an Effect boundary; trivial pure transformations remain ordinary functions.
