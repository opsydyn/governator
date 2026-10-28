# Storybook Governance Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox syntax.

**Goal:** Edit selected component declarations safely in the canonical registry from the opt-in Storybook development panel.

**Architecture:** A Node-only adapter verifies the live Storybook source mapping and securely updates a configured registry using authoritative validation and optimistic concurrency. The manager offers a separate accessible form and source-consistency gate; static Storybooks remain snapshot-only.

**Tech Stack:** Storybook 10.6.4, React/Vite, TypeScript, YAML, Vitest, Bun, Moon.

**Spec:** `docs/superpowers/specs/2026-10-28-storybook-governance-editor-design.md`.

## Global Constraints

- Respect the approved design, loopback/same-origin checks, canonical paths, source-matched identities, write conflicts and complete CLI registry validation.
- Keep browser free of Effect, Node and engine imports; never widen the exact Storybook peer or gzip budget.
- Do not push, publish, or treat declarations as evaluated decisions.

## Review Focus

- Registry and story source change during a save: tests reject conflicts and stale mappings.
- YAML aliases, duplicate keys, comments, unexpected fields: tests preserve supported edits and reject unsafe forms.
- Registry paths, symlinks, missing source and story files: tests reject escaping and unsafe inputs.
- Report commit and dirty registry after reload: tests disable current-status claims and clear restrictive filters.
- Unconfigured/static editor and packed consumer: tests ensure read-only fallback and no hidden runtime imports.

### Task 1: Registry authoring boundary

**Files:** Create `packages/storybook-addon/src/registry-editor.ts`; modify `packages/storybook-addon/src/tag-editor-server.ts` and build configuration; test `tests/storybook-registry-editor.test.ts`.

**Interfaces:** `readRegistryEditor(options, storyId, componentId)` returns a validated component and registry revision; `saveRegistryEditor(options, storyId, componentId, revision, fields)` returns updated component and revision. Server derives mapping from Storybook index and source; options explicitly provide repo root and registry path. No browser-supplied path grants authority.

- [ ] Write tests for source-backed identity, round-trip updates and whole-registry validation; watch them fail.
- [ ] Implement constrained YAML transformation and authoritative registry/path validation, rejection of unsupported structures and revision checks with serialized atomic writes.
- [ ] Add server routing under the opt-in local adapter, including request and origin restrictions; test malformed, hostile, concurrent, missing and readonly cases.
- [ ] Run focused boundary tests and commit.

### Task 2: Report-to-source consistency

**Files:** Create local consistency implementation in addon Node adapter, modify `packages/storybook-addon/src/report.ts`, `manager.tsx`, `sidebar-toolbar.tsx` and story markers; test `tests/storybook-report-source-consistency.test.ts`.

**Interfaces:** Local adapter compares report commit with repository HEAD and verifies the registry bytes against that commit; browser treats unavailable/nonmatching verification as unverified when the adapter is active. Static/unconfigured addon labels reports snapshot-only.

- [ ] Write failing tests for dirty registry, changed HEAD, unavailable verification, saved edits, reload, markers and filter fail-open.
- [ ] Implement the local verification and shared state invalidation for every report view, avoiding current-result claims where source consistency cannot be established.
- [ ] Run report, filter and panel regression tests and commit.

### Task 3: Accessible form and packaging

**Files:** Create `packages/storybook-addon/src/registry-editor-ui.tsx`; modify `manager.tsx`, addon README and Starlight guide; test `tests/storybook-registry-editor-ui.test.ts`.

**Interfaces:** `RegistryEditor` receives the selected story and component identity and communicates only with the configured local endpoint. Editable fields match the spec; ID and report decisions remain read-only.

- [ ] Write failing UI tests for edits, save, conflicts, unavailable/static mode and clear declarations-versus-decisions copy.
- [ ] Implement the form, draft recovery and independent tag editing; preserve accessibility and branding.
- [ ] Document setup, safety, report refresh and limitations; validate browser bundle and packed Node-only dependencies.
- [ ] Run tests and commit.

### Task 4: Qualification and integration

- [ ] Run full `bun run check`, Storybook and docs builds, addon boundary and gzip budget checks.
- [ ] Exercise local Storybook editing, persistence, conflict and source-consistency states; qualify packed npm and pnpm consumers with and without report.
- [ ] Obtain an independent whole-branch review, fix actionable defects with regression tests, document evidence and remaining limitations.
- [ ] Commit, fast-forward local `main`, leave human validation deferred, and recommend the next bounded step.
