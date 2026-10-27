# Local release enforcement verification — 27 October 2026

Base eb6434f; implementation b8d9eda and integration fix 0ff1371 on codex/m1-release-candidates. Everything is local. No push, package version command, registry publication, hosted workflow execution or branch protection configuration occurred.

## Checks and decisions

- Full Moon check: nine tasks pass; 114 tests across 17 files. Typecheck, Effect oxlint with warnings denied, oxfmt, generated protocol/validator freshness and dependency/bundle boundaries pass.
- All six package builds and the actual Storybook build pass. Emitted Changesets parser types are portable plain types. Storybook retains its standard vendor chunk-size warning.
- Actual React package simulation: patch blocked; minor blocked; major without matching current review insufficient; exact scoped simulated reviewed major ready as eligible_under_demo_policy; ordinary major still insufficient; changed tarball rejected with exit 2. The simulation runs actual clean-source builds, tarballs, migrated consumer compilation and mapped component tests. Detailed report/receipts: artifacts/release-demo.json and its referenced local fixture directory.
- Dogfood ordinary release plan/check: expected exit 1, Changeset patch versus required major, Button contract 1.2.1 versus baseline 1.2.0 and package 8.4.2 versus baseline 8.4.1. Readiness stays independent: Button/Alert satisfy the limited local unit policy; Select/LegacyAlert remain blocked. Publication/deployment/adoption unknown and publishable=false.
- CLI release summary and generated Storybook release data have identical gate, bump, artifact/source/input digests, reasons and remediation. Root release command exits 2 with an explicit unavailable-publisher message; it cannot call Changesets publish. Changesets status parses all pending declarations without applying versions.

## Archive and source qualification

The preserved baseline is an actual packed prior-source fixture, with tarball, API, manifest, per-file content/mode hashes and expected JSON hash. Capture/check verify that archive rather than accepting a handwritten mirror. Candidate builds occur in temporary clean clones of the exact source SHA; ignored working-tree dist data is not copied. Payload is independently reproduced before fresh local tests. Candidate bytes/metadata, inputs and HEAD are checked again afterward. Installed dependencies and repository build/test code remain operator-trusted.

Regression coverage includes changed archives, unsafe links/exports/size, private declaration decoys, prototype-like legal filenames, stale ignored output, mixed unknown/minor API changes, strict intended version, insufficient/missing intent, normal simulated-review rejection, stale or wrong-scope review, failed tests, source/config changes, unsafe outputs, consumer imports of removed props and canonical temporary/root paths.

## Addon and browser

Updated local addon tarball installed and production-built successfully in independent npm 11.12.1 and pnpm 11.9.0 Storybook React/Vite fixtures, with strictPeerDependencies=true and autoInstallPeers=false in pnpm. Neither fixture installs the private CLI/core/Effect/MCP. Addon remains Storybook-only peer and has no runtime dependencies. Manager bundle: 125,190 bytes raw / 15,123 gzip, below 131,072 / 16,384 limits.

Actual dogfood browser shows the exact release block, declared patch versus required major, reasons, integrity details and separate lifecycle/readiness markers. Unprepared identities/report states show unverified rather than inferred green. The engine's source-bound release summary is consumed unchanged. Optional schema-v1 release fields retain no-report and older-report behavior; browser validation rejects stale or mismatched source summaries and publishable=true.

## Review and limitations

One independent review found no Critical and three Important issues. All fixed with observed RED→GREEN regressions: known minor hidden by unknown aggregate; `__proto__` file omitted from hashes; stale ignored dist reproducing itself. Full suite passes after repairs. No new deferred minors.

Rulings: ordinary release eligibility cannot replace a trusted external owner verifier; multi-entrypoint packages are rejected until fully analyzed; root publishing remains disabled until an external publisher adapter exists. Costs are deliberately blocked normal releases, narrower package support and no actual publication path. The baseline is a local fixture, not authenticated npm provenance. The simulated major proves gate mechanics, not genuine human/visual/a11y acceptance or complete external consumer migration.

.github/workflows/check.yml defines local qualification commands and expected pass/fail fixture assertions. Those commands ran locally; hosted CI and required-check settings remain unverified. Visual, keyboard/focus and automated accessibility qualification, external approval identity, authenticated publication/deployment and MCP remain separate work.
