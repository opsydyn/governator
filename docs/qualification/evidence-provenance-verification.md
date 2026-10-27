# Evidence provenance — local verification

Date: 2026-10-27. This records local evidence for the [evidence-provenance design](../superpowers/specs/2026-10-27-evidence-provenance-design.md). No remote, provider credentials, publication or deployment were used.

Schema 1 remains the default output; schema 2 is explicitly selected with `--report-schema 2` for CLI evaluation or checking, and the local dogfood report selects it. New addon and snapshot readers accept both. Old schema-1 readers reject schema 2. Reported evidence metadata does not authenticate its producer or authorize a release. MCP pure re-evaluation does not reproduce recorded evidence attestations or claim metadata parity.

## Local checks

- On implementation commit `d639012`, `bun run check` passed nine Moon tasks, including **600 tests across 43 files**. The workspace build passed all 11 targets, five from cache; dogfood report generation and the Storybook build also passed. Storybook emitted a large-chunk warning.
- The addon build passed its unchanged size limits at **110,144 bytes raw / 13,116 bytes gzip**, with Storybook the sole consumer peer. Focused decoder and rendered-panel tests passed; a subsequent test-only commit `510127d` strengthened the age assertion and passed 23 rendered-panel tests.
- Individual contract, consumer and panel changes passed independent spec and quality reviews. A minor review finding about the age assertion was fixed and re-reviewed. An independent whole-branch review found no actionable findings and ran 22 focused report/addon tests and the addon boundary check.

## Browser observation

In local Storybook against the source-bound schema-2 dogfood report, Button showed its selected unit-test evidence ID, reported `vitest` producer and `adapter` provenance, observed UTC timestamp, age at evaluation, and the local report path as text. The panel stated that producer and provenance are reported information, not authentication. The candidate release remained blocked.

A temporary schema-1 fixture displayed the same evidence ID with unknown producer, provenance, observation, age and source. Reload retained focus, and the original generated report was restored byte-for-byte (SHA-256 `7a97ad75eb8c0cd46cf4a3bafce576c1e6b45924bd4e9c2c6951a8be713d91af`). Automated rendered-panel tests cover safe web links and unsafe or relative sources; these were not separately exercised in the browser.

These observations are not screen-reader acceptance, WCAG conformance, hosted CI or production qualification. A later clean-consumer packaging run must test the final release candidate.
