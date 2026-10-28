# Storybook source navigation qualification

Local qualification on 28 October 2026 covered addon source commit `2792734d970cbbdd09933204d974c98a1423d3fc`.

- `bun run check` passed 668 tests across 58 files and 18 workspace tasks, including lint, types, protocol and dependency boundaries, formatting and documentation links.
- `bun run storybook:build` and `bun run addon:check` passed. The manager was 82,140 bytes raw and 14,063 bytes gzip, down from 16,060 bytes gzip at the previous qualification; its gzip limit is 16,384 bytes.
- A local dogfood browser session on the earlier `d070335` implementation opened the blocked Select story from discovery and showed its governance details. A separate browser session on the reviewed packed npm candidate opened its Button story from discovery; the destination without a configured report showed the unverified state.
- Independent npm and pnpm consumers installed the packed addon and built Storybook with and without a copied report. The candidate SHA-256 was `4283ca0adb4d69b9ab1d49a18dba670461b6a8f3e52a36c0daf861731d048ae9`; local evidence is in `artifacts/addon-consumer-oi4p5sf0/summary.json`. The registry was reconstructed from a local cache, not a live npm registry.
- Tests compare the optimized validator with the original schema across valid schema 1 and 2 reports, a release-bearing report and field mutations. Source indexing tests cover literal overrides, ambiguous metadata, inherited markers, `.story` files and object-prototype story names.

Navigation covers statically readable local CSF metadata only. Dynamic or ambiguous files, composed Storybooks and unsupported custom indexers may remain unlinked. Storybook displays the reserved `governator:` index tags in its filter menu. The dogfood report is a local unverified fixture and its compatibility gate intentionally remains blocked. These checks do not establish registry provenance, hosted behavior, complete screen-reader accessibility or human acceptance.
