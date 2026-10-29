# Governator 0.2.0 release-day candidate

The selected source is `16bb3c282eee517176d3c259d8cd1bc13ad0f447` on local `main`. It includes the complete Storybook UX phase and the compact, accessible readiness-unavailable disclosure. This candidate supersedes the earlier `cfd81a9` archives; publishing the earlier addon would omit those changes.

The three packages were built once and packed with `npm pack --ignore-scripts` into the retained local directory `artifacts/governator-0.2.0-current-Lv0mFc`. The CLI and MCP archives reproduced their earlier bytes. The addon changed and is selected by its new exact hash.

| Package                                     |  Bytes | SHA-256                                                            |
| ------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `@opsydyn/governator-cli@0.2.0`             | 263529 | `9446366783b9731914b72b4f4c51dd1c781f76fccb5e06bf542d721c9e82d629` |
| `@opsydyn/governator-mcp@0.2.0`             | 287139 | `2fa7837b2be01e43d22cf088e43e0c73ba4316c5b0d1ddb3206dd1d6dcfe6901` |
| `@opsydyn/storybook-addon-governator@0.2.0` | 163395 | `4dfe18ac89e447e279daeebda3a5c8602fd5124147dba73f2b346fde2ea02c3d` |

Fresh source qualification passed all 18 workspace tasks, 85 test files and 849 tests, followed by the full workspace build. The exact addon archive passed clean npm and strict-peer pnpm installs plus both no-report and configured-report Storybook static builds. Local evidence is retained in `artifacts/addon-consumer-jvg5heqk/summary.json`; its dependency inputs were reconstructed from the local Bun cache under loopback-only confinement, so it is not npm registry provenance.

The tracked inventory in `governance/publishing/0.2.0.json` is the publication selector. The publisher verified these bytes before sending them and verified the npm tarball bytes after publication.

## Publication result

All three packages are public on npm at `0.2.0` with SLSA provenance metadata. Push-triggered governance CI [40965151867](https://github.com/opsydyn/governator/actions/runs/40965151867) and retained-archive rehearsal [40965186071](https://github.com/opsydyn/governator/actions/runs/40965186071) passed first.

npm exposed version metadata before immutable tarball storage on the first two live attempts. Runs [40965779548](https://github.com/opsydyn/governator/actions/runs/40965779548) and [40966796596](https://github.com/opsydyn/governator/actions/runs/40966796596) stopped on unavailable readback after publishing MCP and the addon respectively. No conflicting resend occurred. Each tarball was then observed independently at its selected size and SHA-256. Final reconciliation run [40967626952](https://github.com/opsydyn/governator/actions/runs/40967626952) read all three exact archives from npm and completed successfully without republishing them.
