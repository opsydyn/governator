---
title: Evidence, provenance and trust
description: Why a passing record and a trusted local observation have different meanings.
---

A report can describe success without establishing who observed it. Governanator keeps the declaration, the observation and its trust boundary visible. JSON fields, digests and self-consistent timestamps can establish consistency; they cannot authenticate a producer by themselves.

Importing Vitest JSON records its digest and declared source association. Every imported record stays unverified, including reports containing approval-like fields. A local `check` instead executes installed Vitest in the same producer-to-gate process, observes times and rechecks clean source/config/mappings. Only that in-process path supplies its content-bound test attestations.

This local proof trusts the operator, installed dependencies and repository test/config code. It is not isolation from hostile code running with the same OS privileges. The retained receipt is useful audit data, not a portable signature. Loading the receipt or report later cannot reconstruct the in-memory attestation.

Schema 2 makes selected producer, provenance and observation metadata inspectable. It changes presentation, not readiness or authentication. Snapshots likewise preserve recorded reports while pure queries evaluate canonical evidence with empty verified maps. A snapshot's `unverified-snapshot` or `simulated-snapshot` scope matters as much as its displayed result.

Freshness is bounded: the dogfood unit policy accepts evidence up to 24 hours old, Storybook rejects reports older than 24 hours, and snapshot/report/release/candidate lifetimes are capped at 24 hours. Snapshot expiry keeps the earliest deadline; export/reload cannot renew old observations. Age displayed at report evaluation is not a live guarantee.

Explicit digest-checked baseline fixtures, synthetic review evaluators, fixture signatures and synthetic signed policy lifecycles exercise local mechanics. They do not establish authenticated npm releases, independently protected reviewer authority or real GitHub approval. The inactive source-review reader returns unverified observations. Ordinary changed releases remain blocked without a trusted owner-review adapter.

Local builds/tests, consumer compilation and SSR observations do not establish browser, accessibility, human or hosted acceptance. Publication, deployment, usage and adoption need separate evidence. See [report validation](/reference/report-schemas/) and [MCP scope](/reference/mcp-tools/).
