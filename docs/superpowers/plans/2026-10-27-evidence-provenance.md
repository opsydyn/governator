# Evidence Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Show accurately attributed, explicitly unverified evidence details in Storybook through a compatible versioned report.

**Architecture:** Preserve strict schema 1 and add schema 2 with per-check evidence records selected by the existing evaluator. New consumers read both; existing producers default to v1, and dogfood explicitly selects v2. CLI, Storybook and MCP preserve the version and decision semantics.

**Tech Stack:** Bun, Effect Schema, TypeScript, JSON Schema/AJV, React, Storybook, Vitest and Moon.

**Spec:** `docs/superpowers/specs/2026-10-27-evidence-provenance-design.md`.

## Global constraints

- Local only; no provider access, remote changes, push, publication or deployment. Preserve package version `0.1.0`.
- Schema 1 stays valid and is the default output; v2 is opt-in; unknown versions fail closed. Old readers reject v2.
- Per-check v2 records correspond one-to-one to selected evidence IDs. Never invent data or promote serialized metadata into trust, approval or release authorization.
- Observation time is canonical UTC, no later than evaluation; age is relative to evaluation. Relative sources are text; only credential-free HTTP(S) URLs may be links.
- Keep freshness, gate and release behavior, Storybook-only peer, dependency boundaries and 131072 raw / 16384 gzip byte limits unchanged.

## Review focus

- Duplicate or mismatched IDs and unrelated evidence: reject inconsistent v2 records; project only matched selected records.
- A v1 report or unknown version: preserve old output and render unknown provenance; reject unsupported versions and strict extra fields.
- A snapshot carrying v2: preserve report version and distinguish recorded from re-evaluated evidence, without implying identical trust.
- Malicious or relative source references and future times: safe text or vetted links; reject invalid time relations.
- Generated dual validator size: check addon budget early and do not weaken strictness or silently increase the budget.

## Task 1: Versioned report and evidence projection

**Files:** `packages/core/src/domain.ts`, `packages/core/src/evaluate.ts`, `packages/protocol/`, `scripts/protocol.ts`, `tests/protocol.test.ts`, core evidence tests.

**Interfaces:** `evaluate(input, reportVersion = 1)` returns v1 for 1 or v2 for 2. Schema-2 checks carry `evidence`, an array of `{ id, producer, observedAt, provenance, sourceUrl? }`, in evidence-ID order. Provide strict v1 and v2 schemas and a shared both-version decoder; retain existing v1 compatibility.

- [ ] Write failing tests for v1 unchanged, v2 passed/failed/expired/waived/missing evidence, deterministic exact selected-ID mapping, duplicate/missing/unreferenced records, malformed/cross-check metadata, unknown versions and future/canonical times. Record RED.
- [ ] Implement projection and strict schemas/semantic checks; regenerate plain JSON Schema and TypeScript; run focused tests and `bun run protocol:check`. Check addon-validator/bundle feasibility early with strict dual versions; report any budget failure rather than relaxing a limit. Commit locally.
- [ ] Independent task review and fix regressions with scoped re-review.

## Task 2: Consumer selection and snapshot compatibility

**Files:** `packages/cli/src/commands.ts`, `packages/cli/src/evidence.ts`, `packages/query/src/`, `scripts/dogfood-report.ts`, CLI/snapshot/MCP tests and runbooks.

**Interfaces:** CLI `evaluate` and `check` accept `--report-schema 1|2` (default 1); `runLocalCheck` accepts a version argument defaulting to 1; dogfood requests 2. Snapshot export reads and preserves either selected report; pure re-evaluation retains honest scope and makes no v2 metadata parity claim it cannot support.

- [ ] Add RED tests for default v1 and explicit v2 CLI output, invalid flags, snapshot export/import for both versions, and recorded vs re-evaluated query semantics. Use real evaluated evidence and assert no gate changes.
- [ ] Implement option forwarding, v2 dogfood output and both-version query snapshot validation; update CLI/MCP compatibility documentation. Run focused tests and protocol generation/checks. Commit locally.
- [ ] Independent task review and fix regressions with scoped re-review.

## Task 3: Storybook provenance display

**Files:** `packages/storybook-addon/src/report.ts`, `packages/storybook-addon/src/manager.tsx`, generated validator files, `scripts/addon-validator.ts`, addon tests and README.

**Interfaces:** Decode both strict report versions; render v2 per-evidence ID producer, reported provenance, observation time and age at evaluation, and source. For v1 show unknown details. Relative/unsafe references render as text; absolute HTTP(S) without credentials render as accessible links.

- [ ] Add RED decoder and rendered panel tests for both versions, strict association and timestamps, missing source, escaped unsafe schemes/credentials/relative paths, safe link, stable evaluation-time age, and unchanged reload/freshness behavior.
- [ ] Implement compact dual validator and presentation; run focused tests, addon boundary/validator and both bundle limits. Commit locally.
- [ ] Independent task review and fix regressions with scoped re-review.

## Task 4: Qualification and local integration

- [ ] Run full local checks/build, independent whole-branch review and local Storybook dogfood browser checks for v2 details and v1 fallback; record results and limits.
- [ ] Fast-forward to local main; regenerate source-bound dogfood, Storybook build and MCP snapshot/smoke on the final clean commit. No push or publish. Recommend the next bounded release-readiness step.
