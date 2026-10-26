# Storybook and API execution ledger

Approved scope: docs/storybook-contracts-plan.md. Base 611217c; local-only implementation.

- Implemented actual React shared UI library and Moon/Bun Storybook app; preserved stable IDs and added an unmapped diagnostic.
- API snapshot/diff initially RED for absent analyzer; GREEN for actual emitted declarations and TypeScript checker semantics. CLI regression covers real contained declarations, blocked patch and invalid inputs.
- Standalone panel reads plain engine JSON, never evaluates policy or imports private engine. Optional compatibility/owners fields added to schema v1; generated protocol and standalone browser validator checked for drift.
- Review corrections: structural/index/union/hidden callable regressions RED then GREEN; global/module augmentation regression RED then GREEN. Config/manifest/registry mismatches rejected. Runner rebuilds ignored declarations without cached build and verifies clean source before/after.
- Browser corrections: manager failed on React 19 JSX helper against Storybook's React 18 global. Reproduced in real panel, traced installed Storybook globals, changed addon JSX emission to classic React supplied by Storybook. Import regression prevents JSX-runtime reintroduction.
- Distribution: private local tarball tested independently in npm and strict-pnpm; no workspace links or engine dependencies. Both build and render missing-report/real-snapshot states. Pnpm uses supported YAML settings with only esbuild build allowed; no relaxed peer checks.
- Source commit 7832cec after full checks. Generated real source-bound report on clean HEAD. Invalid ignored declaration was deliberately planted first; runner rebuilt it successfully. API/CLI/report parity confirmed.
- Scope ruling: the local unit-only policy is deliberately limited. Readiness and API compatibility stay separate; publication/deployment/adoption unknown. No full M1/release/CI/production acceptance claim. Details and remaining work: docs/storybook-contracts-verification.md.
