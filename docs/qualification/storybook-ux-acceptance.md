# Storybook UX candidate acceptance

Date: 29 October 2026. Status: open until the exact packed candidate and browser tasks are recorded.

This record separates source tests, packed-consumer builds, scripted browser observations and named human acceptance. A passing build does not imply that a browser task, assistive-technology check or unfamiliar-user task passed.

## Candidate identity

| Field | Value |
| --- | --- |
| Package | `@opsydyn/storybook-addon-governator` |
| Published comparison | `0.1.0`; repository demo and hosted demo remain pinned to this release |
| Candidate manifest | local `0.2.0` source; not published by this record |
| Archive SHA-256 | pending exact candidate pack |
| Source commit | pending final qualification commit |
| Storybook | `10.6.4`, React/Vite only |
| Browser and platform | pending scripted browser run |

## Evidence rules

- Automated source tests report code behavior under their named test environment.
- npm/pnpm consumer builds must install the same retained archive and repeat its digest before and after each build.
- A scripted browser result requires the task, browser, viewport and screenshot or trace.
- Human acceptance requires a named assessor, browser, task notes and assisted/unassisted outcome.
- `not run` and `unsupported` are not failures, but they cannot close the release gate.

## Automated and packed-consumer matrix

| Scenario | Current status | Required evidence |
| --- | --- | --- |
| Shared readiness vocabulary and exact story mapping | implemented; final rerun pending | focused Vitest suites and full project check |
| Decision-first panel, toolbar recovery and responsive layout | implemented; browser observation pending | rendered tests plus bottom/right browser screenshots |
| Tag keyboard flow, bounded requests and conflict recovery | implemented; disposable-file browser task pending | unit/integration tests and exact CSF diff |
| Metadata validation, scope, conflict and leave warning | implemented; disposable-file browser task pending | unit/integration tests and exact registry diff |
| Standard subpath report URL test | wired into Vitest graph; final rerun pending | test command output |
| npm consumer, no report | not run for this candidate | qualification summary and build log |
| pnpm consumer, no report | not run for this candidate | qualification summary and build log |
| npm consumer, configured fresh report | not run for this candidate | qualification summary and build log |
| pnpm consumer, configured fresh report | not run for this candidate | qualification summary and build log |

## Browser task matrix

| Task | Mode and fixture | Status | Evidence |
| --- | --- | --- | --- |
| Read lifecycle, readiness, reason and next action | current candidate, fresh report | not run | pending |
| Distinguish readiness from release approval/deployment | ready component with blocked release | not run | pending |
| Filter, search and navigate with native tags | mixed readiness, mapped and unknown stories | not run | pending |
| Use Controls and Docs without governance mutation | Button controls and autodocs | not run | pending |
| Add/remove/save descriptive tags | local adapter, disposable CSF | not run | pending |
| Correct invalid metadata and save intended record | local adapter, disposable registry | not run | pending |
| Recover conflict and uncertain save without losing draft | injected external edit and delayed response | not run | pending |
| Recover missing, malformed, expired and mismatched data | read-only and local modes | not run | pending |
| Static subpath output | `/governator/storybook/` | not run | pending |
| Bottom/right layout, light/dark and 200% zoom | 300px bottom; 320–400px right | not run | pending |

## Human and assistive-technology acceptance

| Check | Status | Evidence needed |
| --- | --- | --- |
| Keyboard traversal and focus recovery in an actual Storybook manager | not run | named browser, task notes and observed focus order |
| VoiceOver | not run | named browser/platform, task notes and issues |
| Unfamiliar-user install and first value | not run | participant role, selected path, assistance and outcome |
| Unfamiliar-user interpretation and authoring tasks | not run | task notes, hesitations, errors and recovery |
| Brand recognition versus practical task value | not run | recognition and task results recorded separately |

## Explicitly unsupported in this candidate

- Non-React renderers.
- Storybook versions other than `10.6.4`.
- Readiness filtering across composed Storybooks.
- Dynamic or ambiguous CSF declarations that cannot produce a validated story map.
- Hosted writes or shared multi-user locking.
- Formal WCAG conformance; this phase records targeted accessibility observations only.

## Release decision

Open. The final qualification must replace every applicable `not run` above with direct evidence or an explicit accepted limitation. Publication remains a separate action.
