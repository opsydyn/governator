# Storybook sidebar readiness filtering: local verification

Implementation candidate: `12f5b1bd0b7bb95856fbfd8287941d476a15e5c5` (2026-10-28).

- `bun run check` passed: 62 test files, 692 tests, lint, typecheck, addon boundary/bundle checks, docs build and internal links. Moon reported six cached tasks.
- `bun run storybook:build` passed for the dogfood app, with Vite's chunk-size warning.
- The local Storybook browser smoke test exercised the readiness selector and its intersection with Storybook's native `candidate` tag filter. This is a sampled interaction, not human or accessibility acceptance.
- The addon was freshly built and packed for independent React/Vite Storybook 10.6.4 npm and strict-peer pnpm consumers. Install and static builds passed with and without a configured report. Consumer browser interaction was not executed. Tarball SHA-256: `2ef1d4fc59d42f0b60e7021beacf314dab944ef98084a3c0e92c047481083d8e`.
- The consumer runner reconstructed dependency archives from the local Bun cache with original manifests; lifecycle scripts were disabled. This does not establish original registry integrity, registry availability, publication, or hosted operation. Full local evidence is in the ignored `artifacts/addon-consumer-_7trv5xx/` directory.
- The manager bundle passed the 16 KiB gzip budget with little remaining headroom; future UI changes must monitor it.

The filter uses the selected report and verified local source mapping. Unknown entries remain visible; composed Storybooks disable filtering. It clears when the report is observed unavailable or expired and does not grant release approval. Human validation remains deferred, and versions beyond the exact 10.6.4 peer remain unqualified.
