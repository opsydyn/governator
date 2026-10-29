# Storybook UX candidate acceptance

Date: 29 October 2026. Status: automated and bounded scripted-browser qualification complete for the retained local candidate. Named human, VoiceOver and wide-desktop visual acceptance remain open.

Follow-up: after this retained-candidate record was completed, the root local Storybook switched from the published 0.1.0 alias to workspace-addon dogfood. The hosted demo and this record's exact archive evidence are unchanged; the newer source state requires its own retained archive before publication.

This record separates source tests, packed-consumer builds, scripted browser observations and named human acceptance. A passing build does not imply that a browser task, assistive-technology check or unfamiliar-user task passed.

## Candidate identity

| Field                | Value                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------- |
| Package              | `@opsydyn/storybook-addon-governator`                                                 |
| Published comparison | `0.1.0`; at record time the repository and hosted demos were pinned to this release   |
| Candidate manifest   | local `0.2.0`; not published by this record                                           |
| Archive              | `artifacts/storybook-addon-governator-0.2.0-storybook-ux-4b7da5a.tgz`                 |
| Archive SHA-256      | `8e35c14c53b4d82c275227f3d6256523d22a45d004fc5274cec4d53ce4190672`                    |
| Source commit        | `4b7da5a865f20550d9b9ce443caba049355644d3`                                            |
| Storybook            | `10.6.4`, React/Vite only                                                             |
| Browser and platform | Codex in-app browser on macOS; 516 × 954 captured viewport; engine version unrecorded |

The browser run used the exact retained archive installed into the npm disposable consumer from `artifacts/addon-consumer-k0c_nfy8/summary.json`. The harness used `registryEditor: import.meta.env.DEV`, so its static build was read-only while its local dev server enabled the opt-in editors. The archive was not repacked or modified.

## Evidence rules

- Automated source tests report code behavior under their named test environment.
- npm/pnpm consumer builds must install the same retained archive and repeat its digest before and after each build.
- A scripted browser result requires the task, browser, viewport and screenshot or accessibility-tree observation.
- Human acceptance requires a named assessor, browser, task notes and assisted/unassisted outcome.
- `not run` and `unsupported` are not failures, but they cannot close a human or assistive-technology gate.

## Automated and packed-consumer matrix

| Scenario                                                     | Result | Evidence                                                                                                |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------- |
| Shared readiness vocabulary and exact story mapping          | passed | focused Vitest suites and full `bun run check`                                                          |
| Decision-first panel, toolbar recovery and responsive layout | passed | render/interaction suites; captured bottom-panel browser observation                                    |
| Tag keyboard flow, bounded requests and conflict recovery    | passed | source tests plus exact-archive disposable CSF save, external edit, retained draft and explicit reapply |
| Metadata validation, scope, conflict and leave warning       | passed | source tests plus exact-archive validation, registry save, external edit, compare and explicit reapply  |
| Standard subpath report URL test                             | passed | `tests/storybook-preview-path.test.ts` is part of the standard Vitest graph                             |
| npm consumer, no report                                      | passed | exact retained archive; independent install and static build                                            |
| pnpm consumer, no report                                     | passed | exact retained archive; independent install and static build                                            |
| npm consumer, configured fresh report                        | passed | exact retained archive; independent install and static build                                            |
| pnpm consumer, configured fresh report                       | passed | exact retained archive; independent install and static build                                            |

The npm and pnpm cases retained the expected archive digest before and after their builds and kept all symlinks inside the independent consumer. Their copied report SHA-256 was `26cb56fcd23b6b988ff2abbfee3b633f8c6a5d3f95d37a3897c52b603123ded0`. The final source gate completed 84 test files and 848 tests with format, lint, typecheck, protocol, boundaries, docs and addon checks passing.

## Scripted browser task matrix

| Task                                                    | Mode and fixture                                  | Result                        | Direct evidence                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Read lifecycle, readiness, reason and next action       | exact archive, static fresh report                | passed                        | `stable`, `Ready`, owner, reason and next action present in the accessibility tree and captured bottom panel                   |
| Distinguish readiness from release approval/deployment  | ready component plus release-safety wording       | passed with automated support | browser showed the compatibility/release next action; automated interaction tests cover a separately blocked release           |
| Filter, search and navigate with native Storybook UI    | exact archive, mapped story                       | passed                        | readiness select changed to `Needs attention`; sidebar emptied, reset, exposed semantic `Stable Ready`; native search found it |
| Use standard addon tabs without governance mutation     | exact archive                                     | passed                        | Controls, Actions and Interactions remained standard Storybook tabs; Governance was an additional tab                          |
| Add/remove/save descriptive tags                        | exact archive, local adapter, disposable CSF      | passed                        | Enter added tags; save updated all stories in the named CSF and hot reload completed                                           |
| Correct invalid metadata and save intended record       | exact archive, local adapter, disposable registry | passed                        | invalid `v2` produced a linked field summary; a corrected version and final metadata draft both saved                          |
| Recover concurrent metadata edit without losing draft   | injected external registry edit                   | passed                        | intended/current declarations were shown separately; explicit reapply then save produced the intended record                   |
| Recover concurrent tag edit without losing draft        | injected external story edit                      | passed                        | intended/current tags remained available; explicit reapply then save produced the intended tag set                             |
| Warn before leaving with unsaved tags                   | exact archive, local adapter                      | passed                        | navigation was aborted with `ERR_ABORTED` and the `leave-draft` value remained in the editor                                   |
| Recover an uncertain/delayed save                       | automated interaction tests only                  | not browser-run               | draft preservation and focus recovery are covered by source tests; no browser transport delay was injected                     |
| Recover missing, malformed, expired and mismatched data | read-only and local modes                         | partial                       | missing report/local mode and registry-changed mode observed; malformed, expiry and source mismatch remain automated evidence  |
| Static subpath output                                   | `/governator/storybook/`                          | automated only                | standard path test and repository static build passed; the browser fixture was served at `/`                                   |
| Bottom/right layout, light/dark and 200% zoom           | 516 × 954 in-app browser, dark mode               | partial                       | bottom/dark captured; the available browser forced mobile-bottom layout and did not provide a distinct desktop/right run       |

Local screenshots and the packed-consumer summary are retained under `artifacts/`. The final static screenshot SHA-256 is `265031cc0d74742b1a4c02d643feb185a372052b4743c5bcf0e0e845cc193b03`; the final metadata-conflict screenshot SHA-256 is `090cb7f672588c787898c7c8dda1b4b1fe0fbeb954522e18a9944cc8438f5ee9`.

## Human and assistive-technology acceptance

| Check                                                                | Status  | Evidence needed                                                  |
| -------------------------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| Keyboard traversal and focus recovery in an actual Storybook manager | partial | Enter-based authoring worked; named full focus-order run remains |
| VoiceOver                                                            | not run | named browser/platform, task notes and issues                    |
| Unfamiliar-user install and first value                              | not run | participant role, selected path, assistance and outcome          |
| Unfamiliar-user interpretation and authoring tasks                   | not run | task notes, hesitations, errors and recovery                     |
| Brand recognition versus practical task value                        | not run | recognition and task results recorded separately                 |

These rows remain deliberately open. The scripted accessibility tree confirms names, roles, states, a linked validation summary and semantic sidebar descriptions; it is not a VoiceOver or WCAG-conformance result.

## Explicitly unsupported in this candidate

- Non-React renderers.
- Storybook versions other than `10.6.4`.
- Readiness filtering across composed Storybooks.
- Dynamic or ambiguous CSF declarations that cannot produce a validated story map.
- Hosted writes or shared multi-user locking.
- Formal WCAG conformance; this phase records targeted accessibility observations only.

## Release decision

Accepted for local automated and bounded scripted-browser qualification. The candidate improves the core Storybook workflow and preserves the safety boundary between declarations, readiness and release approval. It is not a human usability, VoiceOver, wide-desktop/right-panel, light-theme or 200%-zoom acceptance result. Publication remains a separate action.
