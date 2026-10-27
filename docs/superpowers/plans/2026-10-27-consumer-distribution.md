# Consumer Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Prepare and verify local `0.1.0` addon, CLI and MCP tarballs for independent consumers.

**Architecture:** Bundle private workspace engine and Effect into CLI/MCP builds while keeping conventional external dependencies explicit and TypeScript's runtime libraries resolvable. Keep Storybook addon independent; qualify packed artifacts with independent consumers and a clearly identified local-only package source.

**Tech Stack:** Bun 1.4.2, Moon, tsdown, Changesets, TypeScript 5.9.3, npm, pnpm, Storybook 10, Vitest and MCP stdio.

**Spec:** `docs/superpowers/specs/2026-10-27-consumer-distribution-design.md`.

## Global constraints

- Keep all packages private at `0.1.0`, release command disabled and release workflow disabled; no push, publish, provider credentials, registry network or deployment.
- Local caches or explicitly reconstructed local sources only. Consumer fixtures must be outside the monorepo and must not use workspace `node_modules`. Distinguish reconstructed local packages from real registry artifacts and leave unavailable checks as release gates.
- Bundle internal workspaces and Effect into CLI/MCP; no leaked private runtime, declaration or peer dependencies. Declare retained runtime externals; preserve usable TypeScript compiler libraries and Bun `>=1.4.2` runtime.
- Addon has no runtime dependencies, Storybook as sole peer, and unchanged raw/gzip budget. Keep reports, gate and evidence semantics unchanged.
- Never clean an output tree containing symlinks to other directories; inspect targets before cleanup. Do not overwrite user files or remove other plans' artifacts.

## Review focus

- Published manifests and JS/declarations must resolve independently of workspace packages, including both CLI/MCP exports and bins.
- Bundled code must use a consumer-installed TypeScript compiler with its lib files during real API analysis.
- Installed CLI `check` must execute consumer-owned Vitest with tracked config and preserve receipt, v2 provenance and exit semantics.
- MCP must read the installed CLI's snapshot with fourteen tools and no promotion of unverified evidence.
- npm/pnpm fixtures must exercise actual packed addon and strict peers, avoiding rewritten third-party manifests or workspace dependencies; report offline reconstruction limits.

## Task 1: CLI and MCP distribution closure

**Files:** `packages/cli/package.json`, `packages/mcp/package.json`, their `tsdown.config.ts` and public boundary types as needed, root `bun.lock`, packaging tests.

**Interfaces:** Both packages retain existing executable names and usable programmatic exports; Bun `>=1.4.2`. `@governanator/*` and Effect are bundled implementation details, with no unresolved private imports in emitted JavaScript or public declarations. Conventional third-party dependencies required by emitted runtime or public types are declared. Preserve effect/gate behavior.

- [ ] Add failing tests for packed manifest, emitted imports/declarations and public type consumer; record RED against current packaging.
- [ ] Implement bundling and accurate direct runtime dependencies, regenerate lock offline, build and pack, run focused tests, `publint`, strict declaration import and actual executable startup. Keep output cleaning away from dependency links. Commit locally.
- [ ] Independent review; resolve Critical/Important findings with regressions and scoped re-review.

## Task 2: Independent CLI/MCP consumer qualification

**Files:** focused test/qualification scripts and fixtures under `scripts/` or `tests/`, documentation and retained ignored evidence under `artifacts/`.

**Interfaces:** Install fresh packed CLI/MCP and declared dependencies without workspace links; run installed CLI evaluate/check/contracts/snapshot and MCP stdio. External fixture is an independent committed Git project with installed Vitest 4 and ignored artifacts. Sources reconstructed from Bun cache must preserve original dependency manifests.

- [ ] Add regression checks that expose missing runtime/type dependencies and use installed binaries, including a nontrivial TypeScript declaration compatibility case, a real v2 test receipt, snapshot and fourteen-tool parity, and invalid MCP startup.
- [ ] Implement a reproducible local-only fixture/qualification runner with isolated package caches; run against current tarballs. Record package-source provenance, commands and all limitations. If an offline dependency is missing, retain the failed check as open rather than faking a pass. Commit locally.
- [ ] Independent review; fix important findings and re-review.

## Task 3: Addon qualification and consumer documentation

**Files:** `packages/storybook-addon/package.json`, package READMEs, `README.md`, `docs/releasing.md`, qualification runner/tests as needed.

**Interfaces:** Only React/Vite 10.6.4 is qualified unless tested otherwise. Pack the actual addon and test both npm and pnpm with strict peers in fresh independent Storybook consumers, including no-report and configured-report behavior. Preserve Storybook-only peer and current budgets.

- [ ] Narrow unsupported framework metadata and document installation/setup for addon and Bun CLI/MCP, prerequisites and limitations; correct disabled publication instructions.
- [ ] Build/pack actual addon and execute clean npm and pnpm consumer installations/builds using local source; check empty and configured reports. Record exact evidence and whether source is reconstructed or real registry, and keep blocked cases open. Commit locally.
- [ ] Independent review; fix important findings and re-review.

## Task 4: Whole-branch verification and integration

- [ ] Run local full checks/build, independent whole-branch review and source-bound dogfood/Storybook/MCP verification; document observed results and remaining release gates.
- [ ] Fast-forward local main; rerun appropriate final checks on the final commit. Never push or publish. Recommend the next bounded release step.
