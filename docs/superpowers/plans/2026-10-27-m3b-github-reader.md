# M3b GitHub Review Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Collect bounded, explicitly unverified GitHub source-review observations through an injected transport, without activating a real connection or approval gate.

**Architecture:** Add a private `@governanator/github-review` package with strict Effect schemas and a collector. The only network capability is a caller-provided transport; module import, construction and tests never discover credentials or access the network. The output is unverified, and neither release nor MCP accepts it as trusted approval.

**Tech Stack:** Bun 1.4.2, Moon 2.6.4, TypeScript 5.9.3, Effect 4, tsdown, Vitest, oxlint/oxfmt; no new runtime dependencies except existing workspace core/Effect.

**Spec:** docs/superpowers/specs/2026-10-27-m3b-github-review-reader-design.md, explicitly approved by the user.

## Constraints and review focus

- No real GitHub calls, credential discovery, client configuration, publishing, push or hosted activation. No new release/MCP approval pathway. Outputs and copied JSON remain unverified observations.
- The supplied transport must be told `redirect: "manual"` before each request and must itself honor that contract; reject redirects/wrong final origins, and never forward opaque next-link credentials or output transport errors, bodies or tokens.
- Read the review-list endpoint only, never GET the PR itself; stable repository numeric identity, current head, roles, effective approval state, cross-page consistency and artifact binding remain unverified.
- Validate strict scope/path, safe IDs and states, PR URL when present, UTC timestamps (normalizing zero-to-three fractional digits; impossible/submillisecond timestamps reject), null actors/pending times, duplicates, pagination loops and missing/partial pages.
- Stream with abort-aware per-request timeouts: at most 10 pages/100 entries each, 1 MiB/page, 8 MiB total; limits apply during reads even with missing/false Content-Length. Provider/parse/limit failures never return partial success.
- Test fake transport only; prove real fetch/credential discovery absent, and that forged/copied observations cannot authorize a real release. Maintain protocol/addon boundary and budget, all checks/builds. Independent review; merge locally to main; refresh dogfood/Storybook/MCP artifacts.

## Task 1 — Private reader and package

**Files:** Create `packages/github-review/{package.json,moon.yml,tsdown.config.ts,README.md,LICENSE,src/*.ts}` and `tests/github-review-reader.test.ts` plus fixture helpers if needed. Update `.moon/workspace.yml`, root build, `tsconfig.json`, `vitest.config.ts`, and lint overrides only narrowly if adapter boundary requires them.

**Interface:** `collectGithubReviews(rawScope: unknown, transport: ReviewTransport, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<ReviewResult>`. Scope contains explicit owner/repository/PR and canonical collection timestamp; the trusted caller/transport owns credentials, which the collector never discovers or returns. Transport receives a validated same-origin URL, GET, manual-redirect request and abort signal; its response exposes status, headers, final URL/redirect flag and a byte stream. It must not automatically follow redirects. Results are plain schema-versioned JSON with `assurance: "unverified"`, explicit complete/incomplete/unavailable status, sanitized reason codes, requested scope, observed data only on complete results, and limitations including unverified current head, roles, artifact binding and cross-page consistency. Malformed input either returns a typed sanitized error or throws an existing typed validation error.

- [ ] Write failing fake-transport tests for valid multipage and empty results, API states and time normalization; run RED missing module. Add adversarial tests matching every global constraint, including streaming limits and abort during body reads.
- [ ] Implement strict URL/path/pagination and streaming reads, bounded input/output, duplicate detection, state normalization and sanitized errors. Do not return partial review lists on failures; empty missing-Link final page is provider-reported completion, not proof of consistent history.
- [ ] Prove transport not invoked before explicit collector call; verify no default global fetch or environment access. Test token/body/exception redaction and malicious redirects/Link origin.
- [ ] Run focused tests, full workspace checks, eight existing plus new package builds and dependency/budget guards. Commit locally.

## Task 2 — Isolation and operator docs

**Files:** `tests/mcp-github-observation-isolation.test.ts`, `docs/m3b-verification.md`, root README, spec status, private package Changeset and `governance/release.json`.

- [ ] Use actual mocked collector output, plus forged flags, as hostile review data in real candidate check; verify normal release remains insufficient. Verify snapshot/shared query and SDK MCP remain unverified/simulated observations.
- [ ] Document caller transport and credential boundary, unverified semantics, limits, execution commands and conditions for later live qualification. Add Changeset and enumerate it in governance release config.
- [ ] Run focused tests, full Moon checks and all package builds; commit locally.

## Task 3 — Final review and local integration

- [ ] Obtain independent whole-branch security/spec review. Fix Important issues with RED→GREEN regressions and rerun checks.
- [ ] Fast-forward local main and verify checks/builds. Generate fresh dogfood reports, Storybook build, a new snapshot and built MCP SDK smoke on final clean main.
- [ ] Recommend next bounded trust-anchor/artifact-binding and real-provider qualification, keeping all live access and publication separately authorized.
