# Storybook Freshness and Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Prevent expired governance decisions from remaining ready and make report reload, copy feedback and recovery usable by keyboard.

**Architecture:** Keep validation in the addon report boundary and share a small freshness strategy between panel and sidebar. Retain validated reports only as unverified observations, revalidate after asynchronous work and at expiry/visibility return. Preserve a stable panel control and live status through state transitions. This slice does not change the report protocol or release gate.

**Tech Stack:** Bun, TypeScript, React, Storybook 10, Vitest, Moon, oxlint/oxfmt, tsdown. A pinned root dev-only `happy-dom@20.10.6` may be installed from the existing offline Bun cache for real rendered React interaction tests; no addon runtime dependency or extra consumer peer.

**Spec:** `docs/qualification/storybook-panel-accessibility-audit.md`, approved first fix slice.

## Global constraints

- Local only; no real provider, account, remote, push, publish or deployment. Do not change the evidence-provenance contract in this slice. Reports/snapshots remain unverified and no UI state implies release eligibility or production use.
- The current rule is stale when age **exceeds** 24h, so exactly 24h is valid; expire at earliest governance or release evaluation timestamp + 24h + 1ms. Future/invalid time, mismatched release source, unsupported schema and malformed inputs keep failing closed.
- Validate against current time **after** response/body completion. Preserve injectable deterministic clock and existing numeric-time callers where appropriate; do not follow cross-origin or redirect URLs or send credentials. A stalled/failed request, cancellation, unmount, URL change or old response cannot revive stale or superseded state.
- Panel and sidebar must not show ready beyond expiry while running; visibility/focus return must immediately revalidate after a suspended/delayed timer. A suspended browser cannot update until it resumes. Revalidate cached sidebar observations against the current clock before rendering; do not wait for its 60s poll.
- Preserve the Storybook-only consumer peer, dependency boundaries and addon incremental gzip budget. Test tools remain root dev-only. Use an offline frozen/cache install only; if a needed dependency is not cached report the limitation instead of reaching out to a registry.
- Browser verification uses localhost, the real dogfood report, controlled temporary ignored report fixtures restored byte-for-byte, CUA accessibility tree and keyboard interaction. Do not claim WCAG conformance, screen-reader acceptance or hosted qualification from these checks.

## Review focus

- Report and release expirations, equality boundary and +1 ms; timer throttling/visibility return; sidebar cache reuse beyond deadline.
- Slow fetch crossing expiry; changing URL or reload while requests overlap; rejected/aborted and unmounted requests.
- A reload triggered by keyboard preserves focus or deliberately restores it, including error-to-ready; status announcements are available without stealing focus on automatic expiry.
- Copy promise settles after a story change or rejects; no stale success, unhandled rejection or fake success.
- Missing, stale, invalid, mismatched and unmapped states preserve an actionable Reload and honest explanation; no guessed evidence.

## Task 1 — Freshness and rendered regression harness

**Files:** `packages/storybook-addon/src/report.ts`, `packages/storybook-addon/src/manager.tsx` and optional focused helper(s); `tests/addon-report.test.ts`, `tests/addon-freshness.test.tsx` or equivalent; root test-only dependency/lockfile if needed.

**Interface:** Keep `decodeReport(raw, now)` semantics and `loadReport` as internal addon APIs; allow deterministic clock injection such that fetch validation uses the post-body time. A shared internal revalidation mechanism serves the mounted `Panel` and `SidebarLabel` and can determine the earliest expiry without trusting a cached pre-expiry result. Implementation may split view from Storybook hooks to make actual React components testable, without changing addon public runtime dependencies.

- [x] Add failing tests for report-only/release-only expiry at boundary and +1 ms, a slow fetch crossing expiry, pending older response after URL change, mounted panel expiry and sidebar cached expiry, plus visibility/focus after delayed timers. Use actual React rendering and controlled clocks/timers, not only decoder mocks. Run and record RED.
- [x] Implement current-time post-fetch decoding and shared lifecycle invalidation, preserving request cancellation and current report validation. Include stale release-specific regeneration guidance while retaining rejection of mismatched/future data. Run focused tests GREEN, TypeScript, lint/format, addon boundary and budget. Commit locally.
- [x] Obtain independent task security/spec review, fix Important findings with RED→GREEN regressions and scoped re-review.

## Task 2 — Panel focus, copy and unverified recovery

**Files:** `packages/storybook-addon/src/manager.tsx` / extracted panel view, rendered tests in `tests/addon-panel-interactions.test.tsx`; docs as appropriate.

- [x] Test actual rendered panel: keyboard-triggered reload retains/restores focused Reload across ready/loading/error; alert/status announces result, automatic expiry does not steal focus; unmapped component has functioning Reload. Test copy success/reject, identity switch during pending promise and stale completion. Record tests RED before implementation.
- [x] Implement stable reload control and accessible live feedback, robust per-component copy state/error handling and unmapped recovery. Keep content accurate and preserve report validation/trust. Run focused rendered tests and full addon checks; commit locally.
- [x] Obtain independent task review, fix Important findings and scoped re-review.

## Task 3 — Browser qualification and local integration

- [x] Run full local check/build and review entire branch independently. Use local dogfood Storybook and CUA to repeat ready/blocked/unmapped/missing/stale scenarios, near-expiry panel + sidebar behavior, focus and copy across stories, keyboard disclosures and narrow layout. Temporary ignored report fixtures must be restored with verified checksum. Record actual observations and limitations.
- [x] Fast-forward local main and regenerate source-bound dogfood/Storybook/MCP smoke on clean final commit. No push or publish. Recommend evidence-provenance protocol compatibility design as next independent slice.
