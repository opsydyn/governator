---
title: Report and schema contracts
description: Versioned JSON shapes, reader validation and evidence metadata.
---

The portable protocol supplies readonly TypeScript and JSON Schema without runtime dependencies. In the source checkout, schemas are under `packages/protocol/`:

| Contract             | File / package export                                                              |
| -------------------- | ---------------------------------------------------------------------------------- |
| Report schema 1      | `governance-report.schema.json`; `@governanator/protocol/schema` and `./schema/v1` |
| Report schema 2      | `governance-report-v2.schema.json`; `./schema/v2`                                  |
| Both report versions | `governance-report-versioned.schema.json`; `./schema/versioned`                    |
| Query results        | `query-result.schema.json`                                                         |

`GovernanceReport` is the discriminated union; `GovernanceReportV1` and `GovernanceReportV2` name individual readonly contracts. Reports include source commit, evaluation time, component decisions and an optional release summary. Unknown versions and extra properties are rejected.

`evaluate` and `check` default to **schema 1**. Explicit `--report-schema 2` includes metadata for exactly the selected evidence IDs, in evidence-ID order. Version choice changes neither readiness nor trust. The dogfood producer explicitly selects 2; older schema-1-only readers require 1.

Schema 2 metadata includes producer, declared provenance, canonical UTC observation time and optional `sourceUrl`. Missing source is unknown. Observations cannot follow evaluation time. Source references confer no permission to fetch or execute anything. Metadata describes selected records; it cannot authenticate producers.

Portable readers validate strict JSON Schema first, then call protocol `reportSemanticsValid(report)` on the structurally validated report. Cross-field semantics enforce exact evidence-ID association and times; JSON Schema alone is insufficient. Core `decodeReport` performs both checks.

The snapshot envelope stays **schema 1** and preserves embedded report schema 1 or 2 exactly. Export/reload reject malformed metadata instead of stripping or downgrading it. Pure snapshot evaluations preserve the recorded report version but cannot restore receipt evidence or claim parity with the recorded metadata. `get_design_system_report` returns the saved report unchanged.

Report expiry is enforced by readers, independently of selected evidence age at evaluation. Storybook rejects reports older than 24 hours; snapshots retain the earliest deadline, also capped at 24 hours. See [evidence trust](/explanation/evidence-and-trust/) and [MCP reference](/reference/mcp-tools/).
