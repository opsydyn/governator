# Latest Storybook Dogfood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `bun run storybook` display the current workspace addon with concise source-mismatch recovery and a report bound to current clean `main`.

**Architecture:** The Storybook app consumes the workspace addon directly, while the existing disposable exact-archive consumers remain the distribution proof. Source verification stays fail-closed; only its user-facing copy and compact toolbar presentation change. The ignored report is regenerated after the tracked implementation commit so its commit binding is truthful.

**Tech Stack:** Bun 1.4.2, TypeScript, React, Storybook 10.6.4, Vitest, Moon.

**Spec:** `docs/superpowers/specs/2026-10-29-storybook-latest-dogfood-design.md`

## Global Constraints

- Preserve exact-HEAD, index and working-tree registry consistency checks.
- Use the exact message `Report does not match this checkout. Regenerate the report, then retry.`
- Keep the toolbar diagnostic behind its compact **Status** disclosure.
- Keep published CLI/MCP aliases and exact-archive npm/pnpm qualification separate from workspace dogfood.
- Do not push, publish or change hosted deployment.

## Review Focus

- A mismatched report must remain an error and must never enable filtering.
- A missing adapter or failed registry comparison must use the concise recovery message without claiming the registry was edited.
- The root Storybook config must load the workspace addon's public package name, not the published alias.
- Published CLI and MCP aliases must remain runnable from the demo.
- A regenerated report must name the exact clean `HEAD`; dirty source must still be rejected by the producer.

---

### Task 1: Concise fail-closed recovery

**Files:**

- Modify: `tests/storybook-report-source-consistency.test.ts`
- Modify: `tests/storybook-sidebar-toolbar.test.ts`
- Modify: `packages/storybook-addon/src/report.ts`

**Interfaces:**

- Consumes: `verifyReportSource(state, base, fetcher, signal?, allowSnapshot?)` and `GovernanceSidebarFilter`.
- Produces: unchanged `ReportState` shape with concise mismatch copy rendered only inside the toolbar status disclosure.

- [ ] **Step 1: Add failing assertions**

Assert that a `{ matches: false }` source response returns status `error` with the exact approved message, and that the toolbar keeps it hidden until **Readiness filter help** is opened.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test tests/storybook-report-source-consistency.test.ts tests/storybook-sidebar-toolbar.test.ts`

Expected: FAIL because the source verifier still returns the old registry-specific sentence.

- [ ] **Step 3: Replace the mismatch copy in `verifyReportSource`**

Keep all verification branches and error status unchanged; change only the returned message.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun test tests/storybook-report-source-consistency.test.ts tests/storybook-sidebar-toolbar.test.ts`

Expected: PASS.

### Task 2: Make root Storybook the current workspace dogfood

**Files:**

- Modify: `tests/storybook-demo-config.test.ts` or the nearest existing demo-config test
- Modify: `apps/storybook-demo/package.json`
- Modify: `apps/storybook-demo/.storybook/main.ts`
- Modify: `apps/storybook-demo/README.md`
- Modify: `bun.lock`

**Interfaces:**

- Consumes: the workspace package `@opsydyn/storybook-addon-governator` and its `./tag-editor` export.
- Produces: Storybook configuration whose addon entry and editor import both resolve to the workspace package.

- [ ] **Step 1: Add a failing demo-config assertion**

Import the real Storybook config and assert its addon list contains `@opsydyn/storybook-addon-governator` and excludes `governator-npm-addon`.

- [ ] **Step 2: Run the focused config test and verify RED**

Run the single selected Vitest file. Expected: FAIL because the current config names `governator-npm-addon`.

- [ ] **Step 3: Switch the demo addon dependency and imports**

Use `"@opsydyn/storybook-addon-governator": "workspace:*"`; remove only the published addon alias; retain published CLI and MCP aliases. Refresh `bun.lock` with Bun.

- [ ] **Step 4: Update the demo README**

Describe root Storybook as current workspace dogfood and point exact-archive npm/pnpm qualification to the disposable consumer harness.

- [ ] **Step 5: Run the focused test and Storybook build**

Run the selected Vitest file and `bun run storybook:build`. Expected: PASS and a static Storybook build using the workspace manager.

### Task 3: Commit, regenerate and qualify the live state

**Files:**

- Commit: all tracked files above plus this spec and plan
- Generate ignored evidence: `apps/storybook-demo/public/governance-report.json` and `artifacts/`

**Interfaces:**

- Consumes: clean committed `HEAD` and the existing `dogfood:report` producer.
- Produces: current ignored report whose `commit` equals `git rev-parse HEAD` and a locally usable root Storybook.

- [ ] **Step 1: Run tracked-source gates**

Run `bun run check`, `bun run storybook:build`, and documentation link checks. Confirm the retained candidate archive SHA-256 remains `8e35c14c53b4d82c275227f3d6256523d22a45d004fc5274cec4d53ce4190672`.

- [ ] **Step 2: Commit tracked work on local `main`**

Commit with a focused message. Do not push or publish.

- [ ] **Step 3: Regenerate the dogfood report from clean `HEAD`**

Run `bun run dogfood:report`. Assert `.commit` equals `git rev-parse HEAD`, four component decisions exist and the tracked tree remains clean.

- [ ] **Step 4: Start root Storybook and verify the actual browser state**

Open Select Docs at port 6006. Confirm the sidebar shows component decisions rather than global `Unverified`, and force or test a mismatch to confirm only the compact **Status** control appears until opened.

- [ ] **Step 5: Report boundaries**

Report automated and browser evidence separately; retain human/VoiceOver and publication gates as open.
