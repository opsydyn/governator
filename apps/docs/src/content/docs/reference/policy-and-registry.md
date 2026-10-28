---
title: Policy, registry and source inputs
description: Canonical files and their meaning in a source-bound evaluation.
---

Governance inputs live beneath the selected repository root and must be tracked for normal source-bound operations. Paths must be contained, canonical and non-symlinked. A full checkout without submodules, clean/process filters or hidden index flags is required.

| Input                        | Contract                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `governance/components.yaml` | Schema 1 registry with `components`. Each ID identifies a component across stories, mappings and reports.               |
| `governance/policy.yaml`     | Schema 1 policy with versioned requirements, lifecycle transitions and waiver rules.                                    |
| `governance/tests.json`      | Schema 1 explicit component-to-test-file `mappings`.                                                                    |
| `governance/api-config.json` | Declaration extraction configuration used by the example.                                                               |
| `governance/release.json`    | Exact candidate package/declaration, baseline/archive/digest, mappings, consumers, Changesets and classification paths. |

Registry component fields include `id`, `name`, `package`, `owners`, `lifecycle`, `source`, `stories`, `contractVersion` and `exportPath`; the example also records `packageVersion` and a deprecated component's `replacementId`. A story's `parameters.governance.componentId` must match its registry ID. Names alone do not establish identity.

The dogfood policy version is `dogfood-local-unit-v1`. Its stable target requires `unit-test` from accepted producer `vitest` with `maxAgeHours: 24`. This is explicitly limited local readiness. Lifecycle transitions are draft → candidate → stable → deprecated → retired. A transition declaration is not evidence that a component has satisfied it.

The example enables waivers with a maximum 14-day duration and disallows them for `ownership`. A waiver is a bounded policy exception, not a fabricated passing test or authenticated review. Requirements and policy changes remain reviewed input boundaries.

Run `bun run governator validate` for structural/reference/path validation. Run [local checks](../../how-to/vitest-evidence/) for produced evidence. The authoritative field constraints live in core schemas and generated protocol schemas in the source checkout; policy edits cannot turn saved JSON into trusted attestations.
