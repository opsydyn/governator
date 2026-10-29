# Latest Storybook dogfood and clean source-mismatch recovery

Status: **approved design**. The user approved the diagnosed correction after observing the published 0.1.0 toolbar message wrapping into Storybook content and every sidebar entry falling back to `Unverified` after the report source commit diverged from local `main`.

## Intent

`bun run storybook` is the maintainer's current-product dogfood surface. It should load the workspace addon, present a compact recovery control when governance data is unavailable, and use a report generated from the current clean commit. The message must explain the condition without falsely implying that the registry was edited. Readiness continues to fail closed until source consistency is restored.

## Approaches

1. **Make the root demo consume the workspace addon and keep published-package proof in the existing independent archive consumers (chosen).** This makes the default local experience reflect current product code without weakening distribution evidence.
2. Keep the root demo pinned to published 0.1.0 and add a second Storybook app. This preserves the historical regression surface but creates two demos and leaves the default command surprising.
3. Patch only the 0.2.0 message while leaving the root demo on 0.1.0. This would not fix the observed local surface because npm releases are immutable.

## Behavior

- Replace the published addon alias in the Storybook app with the explicit workspace addon and import its addon and development adapter by public package name.
- Keep the published CLI and MCP aliases available for their existing smoke paths.
- Replace the generic registry-mismatch copy with: `Report does not match this checkout. Regenerate the report, then retry.`
- Keep the toolbar's current compact **Status** disclosure and retry action; no long diagnostic is rendered inline in the toolbar.
- Regenerate the ignored dogfood report only after the implementation is committed, so its `commit` matches clean `HEAD` and the sidebar can display component decisions again.
- Update the demo/readme documentation to distinguish current workspace dogfood from exact-archive npm/pnpm qualification.

## Non-goals

- Do not weaken the exact-HEAD, index and working-tree registry consistency check.
- Do not treat a regenerated local report as publication, human acceptance or authenticated evidence.
- Do not push, publish or change the hosted demo in this slice.

## Verification

Add regressions for the concise message and workspace-demo dependency, observe them fail before implementation, then run the focused report/sidebar/demo tests, full workspace checks, a Storybook build and a live local browser check. Confirm the retained 0.2.0 archive digest is unchanged; the new source state requires a separately qualified archive before publication.
