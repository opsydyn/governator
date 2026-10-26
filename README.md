# governanator

Offline design-system governance: a component's status should show its evidence.

M0 implements a deterministic policy engine, component/package version semantics, digest-checked baseline fixtures and a local CLI. Storybook and MCP arrive in later milestones. All workspace packages are private; nothing has been published.

## Run locally

Use Bun **1.4.2**. Moon **2.6.4** is installed as a pinned development dependency; its toolchain also pins Bun 1.4.2 in the local proto cache. Node is not the governance runtime.

```sh
bun install --frozen-lockfile
bun run check
bun run build
bun run governanator validate
```

The root scripts use Moon's task graph. `bun run build` builds protocol → core → versioning → CLI with tsdown. `bun run check` runs typecheck, oxlint with `@opsydyn/oxlint-effect`, oxfmt, Vitest under Bun, protocol freshness and dependency-boundary checks. It does not publish or version packages.

## Reproduce the local demonstration

The evaluation time is fixed so that the checked-in evidence stays reproducible. These are explicitly **demo** records, not real CI tests or human approvals.

```sh
# Expected exit 0: Button meets the demo policy.
bun run governanator evaluate --demo --at 2026-10-26T12:00:00.000Z --component ui.button

# Expected exit 1: Select has failed test evidence and missing documentation.
bun run governanator evaluate --demo --at 2026-10-26T12:00:00.000Z --component ui.select

# Expected exit 1: complete report includes blocked components.
bun run governanator evaluate --demo --at 2026-10-26T12:00:00.000Z --format json

# Use the built executable after building the workspace.
bun packages/cli/dist/main.mjs evaluate --demo --at 2026-10-26T12:00:00.000Z --component ui.button
```

Exit codes: **0** satisfied policy, **1** blocked or insufficient evidence, **2** invalid inputs/runtime error. `validate` checks file shape, references and contained source paths; it does not approve a component. `--root PATH` selects another repository. `--target` selects a lifecycle policy. Unknown components/options and unsupported formats are errors.

Without `--demo`, evaluation uses Git HEAD, requires tracked source/story files and rejects dirty governance/source inputs. It never accepts demo evidence or approval/attestation flags. M0 has no external trust adapter, so the demo's stable requirements cannot pass in normal mode. M0 is committed locally. Normal-mode evaluation of the demo registry still yields missing proof because its records are explicitly demo evidence.

## Packages

| Package                    | Responsibility                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `@governanator/protocol`   | Generated plain TypeScript and JSON Schema; no runtime dependencies                      |
| `@governanator/core`       | Private Effect schemas, validation, deterministic policy evaluation and canonical digest |
| `@governanator/versioning` | Private SemVer checks, package bump aggregation and baseline verification                |
| `@governanator/cli`        | Bun application: filesystem, Git, clock, error mapping and presentation                  |

See [architecture](docs/architecture.md), [governance model](docs/governance-model.md), [threat model](docs/threat-model.md), [release conventions](docs/releasing.md), [verification](docs/verification.md), and the [original handoff](docs/reference/CODEX_HANDOFF_DESIGN_SYSTEM_GOVERNANCE.md).

## M0 boundary and next milestone

Versioning consumes explicitly classified changes. It does **not** extract TypeScript APIs or decide whether a visual/behavior change is compatible. An unknown classification blocks eligibility. A major requires independently verified review/migration requirements; merely choosing a major is insufficient.

M1 adds a real test-report importer, API extraction/diff, Changesets intent validation, exact release-candidate checks and the Storybook addon with clean-consumer tarball tests. M2 adds read-only MCP. M3 adds verified external approval, publication and deployment adapters. Publication, deployment and adoption stay `unknown` in M0.
