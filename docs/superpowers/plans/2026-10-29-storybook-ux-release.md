# Storybook UX Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Governator's Storybook experience decision-first, consistent, recoverable, recognizably branded and acceptance-ready on React/Vite Storybook 10.6.4.

**Architecture:** Centralize report-derived presentation in small browser-safe view-model helpers consumed by sidebar labels, toolbar and panel. Keep preview Args separate from persisted governance metadata, retain the local same-origin authoring adapters, and improve both editors through bounded requests, explicit modes, field errors and recoverable drafts. Qualify the exact packed addon through automated regression/build checks and recorded browser task evidence.

**Tech Stack:** Storybook 10.6.4, React 19, TypeScript, Vite 8, Vitest/Happy DOM, Bun, Moon, oxfmt/oxlint.

**Spec:** `docs/qualification/storybook-ux-review-2026-10-29.md`

## Global Constraints

- Preserve truthful separation of lifecycle, component readiness, compatibility, release eligibility, publication and deployment.
- Never infer governance from descriptive Storybook tags or story titles.
- Preserve fail-open navigation: unknown, ambiguous, composed and unmapped stories stay visible.
- Keep Effect, Node APIs and engine packages out of the browser bundle; Storybook remains the sole peer dependency.
- Keep all local writes same-origin, loopback-only, validated and revision-checked; never silently overwrite concurrent edits.
- Keep the supplied artwork intact and scope Governator styling to addon surfaces while respecting Storybook light/dark themes.
- Support React/Vite Storybook 10.6.4 in this release; other renderers and versions remain unqualified.
- Do not publish or push as part of implementation or qualification.

## Review Focus

- A selected report cannot truthfully describe an unloaded story with a different report URL or verification mode: tests require explicit selected-report scope and preserve unknown identities.
- A timeout after a write may have committed bytes: tests preserve the draft and label the outcome unknown without an automatic retry.
- A concurrent source edit must not destroy intended changes: tests expose a copyable/reviewable draft and refreshed source before any reapply.
- Bottom and right panel placement have different container widths even in the same window: rendered tests require intrinsic wrapping without viewport assumptions.
- Native Storybook search, tag filters, Controls, Docs and addon tabs must remain usable alongside Governator; packed build and browser tasks exercise coexistence.

---

### Task 1: Shared status presentation and truthful sidebar identity

**Files:**

- Create: `packages/storybook-addon/src/status-view.ts`
- Modify: `packages/storybook-addon/src/manager.tsx`
- Modify: `packages/storybook-addon/src/discovery.tsx`
- Modify: `packages/storybook-addon/src/sidebar-toolbar.tsx`
- Test: `tests/storybook-status-view.test.ts`
- Test: `tests/addon-panel-interactions.test.ts`
- Test: `tests/storybook-sidebar-toolbar.test.ts`

**Interfaces:**

- Produces: `readinessView(gate)` returning shared label, tone and accessible description; `componentStatusForStory(storyId, storyMap, report)` returning a decision only for validated mapped identities; selected-report status context keyed by report URL and verification mode.
- Consumes: existing `storiesByComponent`, report observations, story index invalidation and source/freshness verification.

- [x] **Step 1: Write failing tests** for shared Ready / Blocked / Missing evidence vocabulary, validated mapped-story decisions, unloaded stories in the selected report, unknown mappings and invalidated maps.
- [x] **Step 2: Run focused tests and confirm RED** with mismatched labels and no shared mapped-status helper.
- [x] **Step 3: Implement the browser-safe status view model** and use it in finder, panel and sidebar without weakening source/freshness checks.
- [x] **Step 4: Make sidebar scope explicit** for the selected report; aggregate parents only when descendants are unambiguous, otherwise show Unknown or Mixed rather than a false decision.
- [x] **Step 5: Run focused tests and confirm GREEN**, then run all Storybook filter/navigation tests.
- [x] **Step 6: Commit** as `feat: unify Storybook governance status`.

### Task 2: Decision-first panel, explicit modes and responsive brand system

**Files:**

- Create: `packages/storybook-addon/src/panel-summary.tsx`
- Create: `packages/storybook-addon/src/status-badge.tsx`
- Modify: `packages/storybook-addon/src/manager.tsx`
- Modify: `packages/storybook-addon/src/discovery.tsx`
- Modify: `packages/storybook-addon/src/sidebar-toolbar.tsx`
- Modify: `packages/storybook-addon/src/brand.ts`
- Test: `tests/addon-panel-interactions.test.ts`
- Test: `tests/storybook-discovery.test.ts`
- Test: `tests/storybook-sidebar-toolbar.test.ts`

**Interfaces:**

- Consumes: Task 1 status view model.
- Produces: component summary ordered as identity, readiness reason and next action; named Read-only snapshot / Local editing enabled mode; compact toolbar status with panel-oriented help; reusable `StatusBadge`; container-responsive cards and finder.

- [ ] **Step 1: Write failing rendered tests** proving the summary precedes editing/detail, static mode is described as read-only, toolbar guidance is compact, finder navigation focuses the destination, and dirty-navigation copy names tags or metadata accurately.
- [ ] **Step 2: Run focused tests and confirm RED** against the current order, unavailable copy and retained finder focus.
- [ ] **Step 3: Implement the decision-first summary and staged disclosure** while retaining all release, compatibility, evidence and trust caveats.
- [ ] **Step 4: Implement explicit mode presentation and compact toolbar recovery** using labelled native/Storybook-compatible controls and contextual help in the panel.
- [ ] **Step 5: Implement destination focus and intrinsic/container-responsive layout** for short bottom and 320–400px side panels; preserve reduced-motion behavior and host themes.
- [ ] **Step 6: Run focused tests and confirm GREEN**, then build the addon to enforce browser-boundary and size constraints.
- [ ] **Step 7: Commit** as `feat: make Storybook governance decision first`.

### Task 3: Resilient and keyboard-efficient tag authoring

**Files:**

- Modify: `packages/storybook-addon/src/tag-editor-ui.tsx`
- Modify: `packages/storybook-addon/src/tag-editor-server.ts`
- Test: `tests/storybook-tag-editor-ui.test.ts`
- Test: `tests/storybook-tag-http.test.ts`

**Interfaces:**

- Produces: bounded read/save requests; `Enter` token entry; explicit file scope; read-only display without error styling; unknown-outcome reconciliation; conflict view retaining copyable intended tags and current source.
- Consumes: existing revision-checked tag endpoint and protected-tag preservation.

- [ ] **Step 1: Write failing tests** for Enter-to-add, format guidance, read timeout/retry, save timeout/unknown outcome, static read-only mode, conflict draft retention and no blind retry.
- [ ] **Step 2: Run focused tests and confirm RED** for each missing behavior.
- [ ] **Step 3: Add bounded request handling** with abort cleanup and distinct definite failure / unknown write outcome messages.
- [ ] **Step 4: Add keyboard token entry and explicit save scope** while retaining one deliberate source-file save.
- [ ] **Step 5: Add conflict reconciliation** that preserves and exposes intended tags, reloads current source safely and requires an explicit reviewed reapply.
- [ ] **Step 6: Run focused tests and confirm GREEN**, then run tag storage/CSF/server regressions.
- [ ] **Step 7: Commit** as `feat: improve Storybook tag authoring recovery`.

### Task 4: Actionable registry editing and draft recovery

**Files:**

- Create: `packages/storybook-addon/src/registry-form.ts`
- Modify: `packages/storybook-addon/src/registry-editor-ui.tsx`
- Modify: `packages/storybook-addon/src/tag-editor-server.ts`
- Test: `tests/storybook-registry-editor-ui.test.ts`
- Test: `tests/storybook-registry-editor.test.ts`

**Interfaces:**

- Produces: browser-safe field parsing/validation returning `{ values, fieldErrors, component }`; grouped basic, ownership, contract and link fields; error summary linked to inputs; explicit registry file/scope; conflict comparison and copyable intended declaration.
- Consumes: authoritative server validation and revision-checked save boundary.

- [ ] **Step 1: Write failing tests** for field-specific SemVer, URL, owner and path errors; linked summary; grouped disclosure; changed-file scope; concurrent edit and unknown-outcome draft preservation.
- [ ] **Step 2: Run focused tests and confirm RED** against generic server-only error presentation.
- [ ] **Step 3: Implement browser-side guidance validation** without replacing authoritative server validation or accepting any value the server rejects.
- [ ] **Step 4: Reorganize the form** behind Edit metadata with compact basic fields first and advanced contracts/paths disclosed.
- [ ] **Step 5: Implement conflict recovery** that keeps intended values visible/copyable and refreshes current source before explicit reapply; add a page-leave warning only while dirty.
- [ ] **Step 6: Run focused tests and confirm GREEN**, then run registry/YAML/path/server regressions.
- [ ] **Step 7: Commit** as `feat: make Storybook metadata edits actionable`.

### Task 5: Current onboarding, demo semantics and acceptance harness

**Files:**

- Modify: `apps/docs/src/content/docs/how-to/storybook-addon.md`
- Modify: `packages/storybook-addon/README.md`
- Modify: `apps/storybook-demo/README.md`
- Modify: `apps/storybook-demo/.storybook/preview.test.ts`
- Modify: `vitest.config.ts`
- Create: `docs/qualification/storybook-ux-acceptance.md`
- Test: `tests/qualify-addon.test.py`
- Modify: `scripts/qualify-addon.py`

**Interfaces:**

- Produces: one truthful published install path, separate candidate rehearsal path, task-based local/read-only guidance; standard test-graph coverage for subpath report URLs; exact-candidate qualification fields for configured-report build and browser task evidence.
- Consumes: Tasks 1–4 behavior and the existing retained-archive consumer harness.

- [ ] **Step 1: Write failing harness/tests** requiring the subpath test in the standard graph and configured-report/browser evidence fields that cannot silently remain unreported.
- [ ] **Step 2: Run focused tests and confirm RED** against the current optional/open acceptance record.
- [ ] **Step 3: Update docs and demo guidance** for published 0.1.0, candidate 0.2.0 and the next candidate's explicit mode/version identity.
- [ ] **Step 4: Extend qualification records** to distinguish automated build, scripted browser tasks, named human acceptance and unsupported combinations without inventing pass states.
- [ ] **Step 5: Run focused tests and confirm GREEN**, then build docs and static Storybook under `/governator/storybook/`.
- [ ] **Step 6: Commit** as `docs: align Storybook onboarding and acceptance`.

### Task 6: Exact-candidate qualification and Storybook acceptance

**Files:**

- Modify: `docs/qualification/storybook-ux-acceptance.md`
- Modify if evidence requires: tests and source files owned by Tasks 1–5, using a new RED→GREEN cycle for every defect.

**Interfaces:**

- Consumes: exact packed addon produced from final source and the task matrix in the spec.
- Produces: reproducible automated results, browser screenshots and explicit remaining human/assistive-technology evidence.

- [ ] **Step 1: Run focused Storybook suites**, then full `bun run check`, addon build/boundary/gzip checks, docs build and static Storybook build.
- [ ] **Step 2: Pack the exact candidate locally** and qualify npm and pnpm disposable consumers with no report and configured fresh report; record archive digest and source commit.
- [ ] **Step 3: Exercise browser tasks** for reader, filter/search/tags, local editor, errors/conflicts, bottom/right layout, light/dark, 200% zoom and Controls/Docs coexistence; record observed facts and screenshots.
- [ ] **Step 4: Record human acceptance honestly**: complete what can be observed locally; leave VoiceOver and unfamiliar-user sessions open unless actual named evidence is obtained.
- [ ] **Step 5: Run an independent whole-change review**, fix Critical/Important findings through RED→GREEN tests, and rerun the whole suite.
- [ ] **Step 6: Commit** as `chore: qualify Storybook UX release`; leave `main` local and unpushed/unpublished.
