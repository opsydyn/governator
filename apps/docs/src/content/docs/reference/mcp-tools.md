---
title: MCP tools and query limits
description: Fourteen immutable governance queries with explicit provenance and bounded results.
---

The private Bun stdio adapter loads an exported snapshot, then serves read-only memory queries. It never runs tests, builds, packing, network requests, edits, approvals or publication. [Export and launch instructions](../../how-to/mcp-snapshots/) require a clean matching source checkout.

| Tool                         | Result                                                                |
| ---------------------------- | --------------------------------------------------------------------- |
| `list_components`            | Registry entries; filters support lifecycle, recorded gate and owner. |
| `get_component`              | One component and its recorded decisions.                             |
| `get_component_evidence`     | Declared/reported evidence, kept distinct.                            |
| `evaluate_component`         | Pure policy evaluation with empty verified-attestation maps.          |
| `explain_governance_failure` | Reasons from that pure unverified evaluation.                         |
| `get_design_system_report`   | Saved report unchanged.                                               |
| `list_approved_components`   | Policy-eligible entries with `approvalVerified=false`.                |
| `get_component_contract`     | Available baseline/candidate contracts.                               |
| `diff_component_contract`    | Pinned analyzer comparison of available contracts.                    |
| `list_breaking_changes`      | Available detected breaking changes.                                  |
| `explain_release_block`      | Recorded exact-candidate block reasons.                               |
| `get_release_manifest`       | Recorded manifest and digests.                                        |
| `get_consumer_compatibility` | Saved consumer/compiler observations.                                 |
| `plan_component_migration`   | Guidance from actual changes and selected documents; no edits.        |

Discovery supplies strict input/output schemas and read-only, non-destructive, idempotent, closed-world hints. Arguments are validated again by shared Effect schemas. Query `get_component` accepts `{"componentId":"ui.button"}`. Use discovery for the tool-specific argument contract. Lists accept `limit` 1–100 and `cursor` in `offset:N` form; results include total, nextCursor and truncated.

Blocked decisions are successful results. Unknown components are typed tool errors; unknown tools are SDK protocol errors. Unsupported historical versions return `unavailable`. Different contracts sharing a version produce `ambiguous_contract_version` for explicit version lookup; omit the version for current or choose the explicit `candidate` diff selector. No provider history is inferred.

Results include `snapshotDigest`, source, evaluation time, provenance, scope and limitations in `structuredContent`. Saved data is `unverified-snapshot` or `simulated-snapshot`. Pure evaluations use `pure-unverified-evaluation`; saved receipt metadata cannot supply verified maps. Missing release configuration yields `not_configured`; absent explicit consumer compiler records yield `recordedCompile=null`.

| Boundary                              | Limit                                                            |
| ------------------------------------- | ---------------------------------------------------------------- |
| Snapshot                              | 8 MiB                                                            |
| Governance/input file                 | 4 MiB                                                            |
| Migration document                    | 256 KiB                                                          |
| Referenced inputs                     | 32 MiB aggregate / 128 files                                     |
| Arguments                             | 8 KiB                                                            |
| Incoming stdio buffer                 | 16 KiB                                                           |
| Query/MCP result                      | 128 KiB                                                          |
| Snapshot/report/release/candidate age | 24 hours, earliest deadline retained; 60-second future allowance |

Oversized results fail explicitly. Documents are untrusted data, never execution instructions. Cancellation is checked at dispatch boundaries; synchronous queries cannot be preempted mid-computation. Local guarded API tests establish application behavior, not a kernel sandbox or authenticated remote service.
