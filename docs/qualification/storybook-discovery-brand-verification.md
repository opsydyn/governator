# Storybook discovery and branding qualification

Local qualification on 28 October 2026 covered addon source commit `6b07131b96d162199d9e5a8bf4a8a862ebc0dda8`.

- `bun run check` passed: 658 tests across 56 files, 18 workspace tasks, including types, lint, formatting, documentation links and addon boundaries.
- `bun run storybook:build` passed. Storybook reported its standard large vendor chunk warning.
- The addon manager measured 119,988 bytes raw and 16,060 bytes gzip against limits of 131,072 and 16,384 bytes. The gzip limit has 324 bytes of headroom.
- Independent npm and pnpm consumers installed a locally packed addon and built Storybook both without a report and with a copied local report. The package SHA-256 was `f80f88d4577dd2c701481313bc6ceea8b88121ddd044e16b303db5faa100387c`. The local evidence is in `artifacts/addon-consumer-125kon11/summary.json`; dependencies came from a reconstructed local cache, not a live registry.
- In the dogfood Storybook, the panel was inspected in dark and light themes and at a 640-pixel viewport. Filtering and search returned the expected blocked component and the insufficient-evidence empty state. In the independent npm consumer's static build, the configured report loaded and discovery listed the two blocked readiness decisions; the separate release gate remained blocked.
- Tests cover report expiration and focus recovery when discovery disappears. Static Storybook displays tags read-only when the local editor is unavailable.

The discovery list shows validated report decisions, not a complete Storybook story map. It displays up to 100 matches, with the remainder searchable, and does not infer story links from component IDs. The copied report is an unverified local fixture, not trusted provider evidence or publication proof. This qualification does not establish registry provenance, hosted behavior, full screen-reader accessibility, or human acceptance. The consumer builds covered Storybook 10.6.4 with React; other frameworks and versions were not qualified here.
