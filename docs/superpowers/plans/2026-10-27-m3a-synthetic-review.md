# M3a Synthetic Review Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Steps use checkbox syntax.

**Goal:** Evaluate synthetic review observations against an explicitly supplied candidate and fixture authorization policy without creating real approval authority.

**Architecture:** A private pure verifier in versioning decodes versioned fixture-only inputs and returns either a simulated match or an explicit insufficient result. It performs no I/O, time acquisition, GitHub access or side effects and is not connected to the normal release gate. Existing CLI and MCP remain fail-closed; independent integration tests prove serialized claims cannot be promoted.

**Tech Stack:** Bun 1.4.2, TypeScript 5.9.3, Moon 2.6.4, Effect 4 schemas, Vitest, tsdown, oxlint/oxfmt; no new dependencies.

**Spec:** docs/superpowers/specs/2026-10-27-m3a-review-evidence-design.md (approved by user on 27 October 2026).

## Global constraints

- Synthetic fixture data and results must be unmistakably `simulated`; no real GitHub approval, authority or replay-prevention claim.
- No network access, credentials, global settings, live provider activation, publication, push, release/version command or mutating MCP tool.
- Normal release eligibility remains unchanged and cannot accept saved verifier output or arbitrary `verified` flags as trusted approval. Publication, deployment and adoption remain unknown.
- Preserve existing plain protocol/addon dependency and bundle boundaries. Preserve current M2 behavior and run full checks/builds and real local MCP smoke on the final clean commit.
- Finish with a whole-branch independent review and fast-forward local main, as the user requested.

## Review focus

1. A caller supplies fixture roles, body or fake provider data: it must never become real release authority (Task 2 regression).
2. A valid claim from another source/repository/PR/artifact/policy must fail (Task 1 table tests).
3. Missing pages, unknown lifecycle, revoked/unknown role grant or a later current rejection must fail (Task 1 lifecycle tests).
4. Review/binding older than candidate creation, stale, future, expired or longer than 24 hours must fail at the injected clock (Task 1 time boundary tests).
5. Duplicate/conflicting identities, matching hashes with wrong scope and malformed or excessive inputs must not produce a simulated match (Task 1 schema/integrity tests).

## Task 1 — Pure synthetic reviewer evaluator

**Files:** create `packages/versioning/src/synthetic-review.ts`, `tests/m3-synthetic-review.test.ts`; export the API from `packages/versioning/src/index.ts`.

**Interfaces:** `evaluateSyntheticReview(raw: unknown)` accepts one schema-versioned input containing explicit expected candidate/repository/PR/policy scope and clock, a separate fixture-only authorization policy, complete/partial/unavailable/unknown fixture provider observations and separate synthetic artifact-binding claims. It returns a JSON-serializable schema-versioned result with `assurance: "simulated"`, `status: "matched" | "insufficient_evidence" | "not_required"`, stable explicit reasons, and no reusable approval capability. Invalid schemas throw via existing core decode conventions. Use `{schemaVersion: 1, scope, at, policy, provider, bindings}`. Scope carries repository/PR, commit, package/version, baseline/candidate/input/release-policy/authorization-policy digests and IDs, candidate creation time, distributed-change and major flags. Policy contains its own ID, membership completeness/freshness and bounded unique actor-ID assignments with active/revoked/unknown status and owner/API roles; its canonical tamper-detection digest must match the expected authorization-policy digest. The fixture provider contains matching repo/PR/head, availability/completeness, observation time and unique reviews with actor, commit, state, effective current/superseded/unknown, submitted and expiry timestamps. Separate bindings carry review/actor identity, all candidate scope fields, observation and expiry. Exact nested schemas and fixture builders are documented in module/tests; no API is added to CLI, MCP or public protocol.

- [x] Write failing tests for a full matching fixture and every scope, state, freshness, policy, authorization, pagination and ambiguity class in the spec. Run RED for missing module.
- [x] Implement validated, deterministic evaluation: derive eligible reviewer roles from policy, not claimed roles; enforce exact matching on all scopes and separate binding claim identity; one or more authorized current approvals may cover roles. Current changes requested, unclear effective state, duplicate/conflicting IDs, incomplete provider data and missing bindings fail closed. Same-scope recheck is idempotent; no durable one-use guarantee. No distributed change returns simulated `not_required`, never a matched review. Membership may predate candidate creation if current and fresh; do not invent a candidate-relative policy timestamp requirement.
- [x] Enforce bounded collection/input sizes and canonical timestamps; test immediately before/after candidate creation, clock, expiry and 24-hour boundaries. Confirm synthetic-only `assurance` and absence of trust-grant properties on every result.
- [x] Run focused tests, `bun run check` and `bun run build`; commit the independently testable module with its tests.

## Task 2 — Integration isolation and operator documentation

**Files:** create `tests/mcp-review-isolation.test.ts` and `docs/m3a-verification.md`; update README/spec status and add a private versioning Changeset to `governance/release.json` if warranted.

**Interfaces:** Test real `captureCandidate`/`checkCandidate` and M2 snapshot/query APIs; never route simulated matching result into trusted host context.

- [x] Test arbitrary serialized `{verified:true}`, claimed roles and simulated matching reports cannot make normal changed releases eligible; saved report/MCP results remain observations. Run tests and record direct outcomes.
- [x] Document actual fixture semantics, expected inputs, explicit local limitations, no external activation, test commands and next live-adapter requirements. Do not imply provider-authenticated review.
- [x] Run all checks and builds; preserve addon budget and generated plain protocol. Commit.

## Task 3 — Review and integrate locally

- [x] Obtain one independent whole-branch review for trust promotion, malformed inputs, lifecycle, role coverage, time and evidence binding. Fix Important findings with failing regressions, then run the full suite.
- [x] Commit final changes. Fast-forward local main; do not push or publish. After final commit generate fresh dogfood report, build Storybook, export a new snapshot and run built SDK MCP smoke. Record what actually passes and what remains unverified.
- [x] Recommend the next bounded M3 GitHub provider/independent trust-anchor design; do not assert live verification until it is actually configured and observed.
