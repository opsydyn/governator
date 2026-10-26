# Storybook dogfood and API compatibility slice

User approved API extraction/compatibility diffs and requested a Storybook app to dogfood Governanator. Base: 611217c. Keep local; no push, publication or hosted resources.

Architecture: one private shared React UI package (`@example/ui`), one Storybook 10 React/Vite app, one independently packed read-only Governance addon, and private TypeScript-compiler API analysis in versioning. The app tests real components and feeds the same evaluator output to the addon. CLI and addon consume identical JSON. The addon imports no engine, Effect, Node or MCP runtime.

1. Test-first API snapshot/diff using pinned TypeScript 5.9.3 and emitted declaration files. Explicit component/export/props mappings. Real checker assignability detects narrowed props; removed exports/props and new required props are major, additions are minor. Unsupported or ambiguous export changes are unknown; behavior/visual compatibility remains unproven. Compare exact digest-checked local release fixtures, never silently main/HEAD.
2. Add real Button, Select, Alert and deprecated LegacyAlert, component tests and CSF stories in a Moon/Bun app. Preserve stable IDs. A baseline Button has a removed public prop; proposed patch versions must be blocked by compatibility analysis.
3. Add optional compatibility details to report schema v1, regenerate plain protocol. Expose contracts snapshot/diff CLI. Compose dogfood reports from actual local test-run decisions plus private compatibility analysis; keep readiness and compatibility separate.
4. Build the addon with official Storybook preset/manager APIs and a generated standalone JSON validator. Missing report works immediately. Explicit same-origin report ingestion, useful invalid/unsupported/stale/fetch/unmapped states, accessible evidence table, light/dark theme support, no credentials or policy evaluation in the browser.
5. Verify static Storybook build, real browser panel/stories, CLI/report parity, packed addon in clean npm and strict pnpm fixtures, dependency/bundle boundary and a measured bundle budget. Document actual evidence and remaining M1 release/CI work. One independent final review, then fix Important findings with regressions.

The TypeScript compiler is the version-pinned equivalent analyzer permitted by the handoff. Snapshot declarations come from real emitted `.d.ts`, not handwritten mirrored prop JSON. A local fixture can demonstrate compatibility but never prove npm publication. Compatibility eligibility is a preliminary API/version check; exact artifact release approval and human behavioral classification remain separate gates.

No new design decisions require user input: React/Vite/Storybook and the addon boundary are already in the approved handoff. Use the existing app chrome/theme; no custom hosted dashboard or branding project.
