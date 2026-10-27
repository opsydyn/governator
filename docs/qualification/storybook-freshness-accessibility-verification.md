# Storybook freshness and accessibility verification

Date: 2026-10-27. This records local evidence for the first fix slice in the [implementation plan](../superpowers/plans/2026-10-27-storybook-freshness-accessibility.md), reviewed at source commit `7c892e5`. The [original audit](storybook-panel-accessibility-audit.md) remains the historical record of the earlier behavior.

## Local evidence

- An independent focused run of `bun --bun vitest run tests/addon-report.test.ts tests/addon-freshness.test.ts tests/addon-panel-interactions.test.ts tests/addon-boundaries.test.ts` passed **38 tests in 4 files**. These rendered and decoder tests cover expiry boundaries, delayed responses and cache reuse, request races, focus recovery, copy feedback and unmapped reload.
- Moon's local test log records **571 tests in 41 files passed**. Its latest recorded successful states cover the nine tasks in the workspace check graph, including the addon build, and all 11 targets named in the workspace build command. Those cached records are evidence of the recorded runs; this review did not rerun the full suite or all builds.
- An independent `bun run addon:check` passed validator freshness and dependency/import boundaries. The existing manager bundle measured **128,206 bytes raw and 16,133 bytes gzip**, leaving **251 bytes** under its 16,384-byte gzip budget. Storybook remains the addon's only consumer peer; the DOM test dependency is root development-only.
- An independent source review of the branch found no Critical or Important findings. The review checked the earliest governance/release expiry, clock boundaries, timers and visibility return, cached and overlapping requests, aborts, focus and clipboard state, stale guidance, and the same-origin, no-credentials and no-redirect report boundary.

## Local browser observations

- In the local Storybook browser, Button showed ready with its exact release candidate blocked; an unmapped story showed unverified and retained Reload. Keyboard-triggered Reload kept focus on Reload. Copy success was announced, and switching to Select reset the copy label.
- With a temporary near-expiry report, the panel automatically changed to unverified and the sidebar label also became unverified. Focus on Copy moved to Reload when Copy was removed. A stale release snapshot gave current release snapshot guidance; a missing report showed HTTP 404 and retained Reload. Reload recovered after restoring the original report byte-for-byte (SHA-256 `3db343df85f9d72f04529563f511ab501e868844cbcfe7054790b4cd5d1d5180`).
- At 640 × 800, the evidence table was 433 px wide inside a 302 px container. The candidate disclosure responded to Enter while focused. The original audit records keyboard scrolling of the table; this run did not repeat that scroll test.

## Remaining qualification

These local browser observations and automated DOM tests do not establish screen-reader acceptance, WCAG conformance, hosted qualification or human acceptance. Evidence-provenance protocol changes are a separate slice.
