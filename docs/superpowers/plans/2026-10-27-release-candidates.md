# Changesets and Exact Release Candidates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox syntax.

**Goal:** Validate developer Changesets against detected changes, and check the exact local tarball plus source-bound evidence before reporting release eligibility.

**Architecture:** Private versioning owns pure intent/release rules; Bun CLI owns clean Git snapshots, contained file IO, fresh build/test/pack and archive inspection. A digest-checked prior local tarball baseline supplies actual distributed file hashes, manifest and emitted API. Saved results never supply trust: check rereads bytes/inputs and reruns tests. Explicit demo mode permits labelled simulated review documents; ordinary checks cannot manufacture trusted owner approval. Storybook displays an optional plain release report without importing policy.

**Tech Stack:** Bun 1.4.2, Moon 2.6.4, TypeScript 5.9.3, Effect Schema, installed Changesets parser 0.4.3, pinned tar 7.5.22, tsdown, Vitest.

**Spec:** docs/reference/CODEX_HANDOFF_DESIGN_SYSTEM_GOVERNANCE.md sections API-grade versioning / release gates / M1; prior docs/storybook-contracts.md. User approved implementation, local checks, no push/publication. Continue natively in this clean checkout on codex/m1-release-candidates; preserve the previous branch.

## Global Constraints

- No push, publishing, registry lookup of pretend releases, hosted execution or enabling release workflow.
- Separate component/package/schema/policy versions. One shared UI package, highest required component bump.
- Explicit local baseline fixture, never treat main/HEAD as a published baseline. Publication/deployment/adoption unknown.
- Major requires review, impact, migration/manual plan, matrix and evidence. Simulated approvals only in explicit demo mode; never publish authorization.
- Existing read-only addon retains sole Storybook peer, browser dependency/bundle budget and no engine imports.

## Review Focus

- Changed tarball, manifest, input or HEAD after candidate capture must invalidate the check, even when saved JSON claims ready.
- Missing/insufficient Changeset; changed runtime bytes without API diff; mismatched component/package/config versions must block.
- Archive traversal, links, duplicate entries, output symlinks, untracked governance inputs and malformed CLI options must fail closed.
- Replayed/stale evidence and self-asserted approvals must never satisfy normal review; demo is conspicuously labelled.
- No-op/docs-only distribution should not force a version; prerelease/0.x/major and shared-package aggregation stay strict.

### Task 1: Pure intent and release policy

**Files:** packages/versioning/src/{intent,release,release-schema}.ts; tests/release-policy.test.ts.
**Interfaces:** parseIntent(contents) imports real Changeset format; assessRelease(validated baseline/candidate, classification, changesets, evidence/review context) returns plain structured gate/reasons/changes/remediation.

- [x] Write failing tests for missing/insufficient declarations, highest bump, exact intended version, runtime-only change, docs-only no-op, unknown classification, prerelease/0.x, demo reviewed major and ordinary untrusted major.
- [x] Run tests RED; implement Effect schemas, real parser and strict rules; run GREEN plus existing suite.

### Task 2: Exact candidate CLI

**Files:** packages/cli/src/{release,archive}.ts; tests/release-cli.test.ts; packages/cli/src/commands.ts.
**Interfaces:** release plan/check --config PATH --candidate PATH [--root PATH] [--demo]; release candidate --config PATH --out DIR [--root PATH]. Candidate capture rebuilds/packages the configured private package on clean tracked source; check inspects that tarball, recomputes API/file digests and inputs, reruns local mapped tests and checks source again.

- [x] Write real-process fixtures and RED tests for successful capture/check, version mismatch, runtime change, artifact/input/HEAD tampering, symlinks/unsafe archives, test failure and no network/publication.
- [x] Implement bounded archive reading without extraction, tracked inputs, exclusive ignored outputs, source/build/test freshness and CLI exit codes 0/1/2; GREEN plus full suite.

### Task 3: End-to-end local release demonstration

**Files:** governance/release*.json, governance/releases/*, .changeset/dogfood-breaking-button.md, fixtures release package, scripts/release-demo.ts, core/protocol optional release details, addon manager, scripts/dogfood-report.ts, .github/workflows/check.yml, docs.
**Interfaces:** optional schema-v1 release summary embeds the exact CLI result; demo script creates isolated local repositories from the committed source and exercises patch/minor blocks, major with missing proof blocked, reviewed simulated major eligible_under_demo_policy, changed tarball blocked. No fake approved booleans, no deployment claims.

- [x] Test report roundtrip/consumer compatibility and demo matrix RED; implement real tarball baseline, actual Changeset, migration/impact/matrix documents and exact artifact-bound simulation.
- [x] Add local CI workflow required-check definition (cannot configure branch protection or execute hosted CI locally); run its commands and label hosted status unobserved.
- [x] Run full Moon checks/builds, Storybook build and browser release panel; independently review whole branch, fix Important regressions RED→GREEN; document remaining M1 gaps accurately.
- [x] Commit locally, generate source-bound report on clean final HEAD; no push/publication.
