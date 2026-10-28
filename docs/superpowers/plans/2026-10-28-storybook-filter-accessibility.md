# Storybook Filter and Accessibility Implementation Plan

**Goal:** Keep navigation metadata out of descriptive tag filters, support additional unambiguous CSF stories and improve keyboard interaction in the tag editor.

**Architecture:** Preserve fail-closed, source-backed mapping and report freshness. Evaluate Storybook's dev and static build lifecycle before moving metadata to a separate channel. Support direct function stories with literal component metadata, and keep dynamic or mutated declarations unlinked. Restore focus to a stable tag-editor control when a focused control disappears and announce individual changes.

**Tech stack:** Storybook 10.6, React, Vite, TypeScript, Bun, Vitest.

## Verification

- Test supported function stories and reject mutated or ambiguous declarations.
- Test tag-editor keyboard focus and distinct announcements for consecutive changes.
- Verify that dev and static Storybook filters contain descriptive tags but not internal navigation metadata; verify navigation, updates and missing mappings.
- Run the workspace and Storybook checks, inspect the result in the browser, qualify the packaged addon and record accessibility limitations.
