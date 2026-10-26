# Storybook and API slice — local verification

Implementation source commit: `7832cec`. Base: `611217c`. Branch: `codex/m1-storybook-contracts`. Local only; no remote, push, publication, deployment or hosted CI run.

## Executed checks

- `bun install --frozen-lockfile`: passes, no lock changes.
- `bun run check`: all nine Moon tasks pass; 93 tests in 13 files, TypeScript, oxlint with warnings denied, oxfmt, protocol freshness, addon validator freshness, protocol boundary and built addon boundary/budget.
- `bun run build`: all six package builds pass. `bun run storybook:build`: actual React/Vite app builds. Storybook's vendor DocsRenderer/iframe bundles emit the standard >500 kB warning; addon budget passes separately.
- Addon manager: 88,432 bytes raw / 11,388 bytes gzip, below 131,072 / 16,384 budgets. Only `storybook` is a peer, no runtime dependencies. Built declarations include the plain protocol types and require no workspace package.
- Built CLI `validate`: exit 0 for four real component entries. Built CLI snapshot: exit 0. Source and built CLI diff: expected exit 1, minimum major, compatibility blocked for removed `tone` and patch candidate. All four report compatibility gates, digests and reasons match CLI diff JSON.
- Actual `dogfood:report` on clean `7832cec`: rebuilds declarations, runs three real UI component tests and records the source and raw Vitest receipt. Deliberately replaced ignored dist declarations with invalid text before invoking it; rebuild repaired them and produced the expected candidate. Readiness: Alert/Button ready, Select/LegacyAlert blocked. Overall assurance remains unverified because the full registry does not meet stable. This is local-process evidence, not authenticated CI or publication proof.

## Independent addon consumers

Packed addon SHA-256: `e926b1564e9913d8733b05ae24b6318c0562a217dd036fe1fa0d4f26140d98c9`. Tarballs are ignored under artifacts; no registry upload.

Fresh standalone directories `/private/tmp/governanator-consumers-zfln__ft/{npm,pnpm}` contain only Storybook React/Vite, React/DOM, TypeScript and the local addon tarball. Neither consumer installs the CLI, core, Effect or MCP. npm 11.12.1 and pnpm 11.9.0 install and production-build successfully. Consumer TypeScript imports of GovernanceReport/GovernanceParameters pass with ordinary TypeScript 5.9.3. The corrected tarball was reinstalled after browser testing found and repaired the React JSX-runtime mismatch.

The pnpm fixture sets `strictPeerDependencies: true`, `autoInstallPeers: false`, default isolated node_modules and the temporary store explicitly in pnpm-workspace.yaml. Only esbuild's official install script was allowed. pnpm 11 reads those settings from workspace YAML, so the earlier .npmrc-only attempt was replaced; strict peer checks were retained. See [pnpm configuration](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/settings.md) and [build approvals](https://github.com/pnpm/pnpm/blob/main/pnpm11/docs/cli/approve-builds.md).

Real browser verification of each static consumer: missing report shows unverified onboarding; configured actual engine JSON shows Button ready under the limited unit policy and API compatibility blocked, with real source/version/digest/evidence information. npm consumer light theme and app/pnpm dark theme inspected. Light-theme screenshot: `artifacts/storybook-consumer-light.png`.

## Dogfood browser verification

At localhost:6006 the actual Button and Select render; Governance panel loads actual generated JSON. Inspected Button's ready unit gate and blocked API diff, Select candidate/prerelease stable block, deprecated LegacyAlert transition block, and Unmapped story's unverified state. Initially missing report returned a clear HTTP 404 state without breaking Storybook. Unit tests separately cover malformed/unsupported/future/stale reports, duplicate IDs, invalid JSON/fetch errors and cross-origin/credential omission. Formal browser accessibility, keyboard/focus and visual-regression qualification are not claimed.

## Review and rulings

One independent read-only review: no Critical; three Important groups. Fixed with failing regressions then passing checks: full structural props and hidden callable types; global/module augmentation contamination; stale dist/source association and registry/manifest/API version drift. Unsupported global/module augmentations are rejected. Unsupported callable shapes require review, so analysis is intentionally conservative. Fixed minor registry import paths to the actual shared package export. Browser runtime failure exposed React 19 JSX helpers against Storybook manager React 18; classic JSX now uses manager-provided React, and import guard rejects JSX-runtime imports.

Remaining M1: Changesets intent validation, exact packed candidate enforcement, authenticated published baselines, wider renderer coverage, browser interaction/accessibility and governance sidebar filtering. Static types do not prove behavioral compatibility. Major review/migration proof remains required; bumping a major alone does not grant approval. Existing private SemVer v-prefix acceptance and raw Vitest summary reconciliation minors remain deferred from prior slices. MCP and external trust/deployment adapters remain later milestones.

The generated report is ignored and source-bound. Regenerate after future commits with `bun run dogfood:report`; receipts cannot recreate trust when imported. The final documentation commit can regenerate the same gates against its new source hash.
