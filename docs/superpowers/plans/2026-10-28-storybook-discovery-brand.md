# Storybook Discovery and Brand Implementation Plan

**Goal:** Help users find blocked and missing-evidence components in the validated governance report, while applying the Governator identity consistently to addon-owned UI.

**Architecture:** Add a report-derived, accessible discovery control to the existing manager panel. Filter and search validated decisions without changing the report schema, inferring a story mapping, mutating Storybook's index or claiming release approval. Display explicit absence and freshness states. Apply red, black and silver design cues to addon-owned elements while respecting the host light/dark theme and retaining distinct semantic status colours.

**Tech Stack:** Storybook 10.6 React/Vite, TypeScript, Bun, Vitest, Moon and local browser checks.

## Constraints

- Do not present saved, stale, malformed or unavailable reports as current. Discovery only uses the same validated, revalidated report as the panel.
- Readiness, lifecycle, release eligibility and descriptive tags remain independent. Do not infer component/story mappings from IDs or names.
- Built-in host controls and user branding outside Governator's addon remain under Storybook's theme; all addon-owned controls use coherent brand cues and accessible focus states.
- No new browser runtime dependencies, Effect or Node; keep the Storybook-only peer and bundle budget. The existing local tag editor continues working and static Storybooks remain read-only.
- Local only; no provider, publish, push or deployment.

## Tasks

1. Add rendered tests for discovery counts, report-derived gate filtering, component/owner search, empty results and status labels. Verify tests fail before implementation.
2. Implement a compact report discovery section with filters and honest ID-based navigation guidance. Integrate into the panel only while a fresh validated report is available. Preserve existing report freshness and focus behavior.
3. Apply the supplied black, silver and red identity to addon-owned panel, tag editor and sidebar markers, while preserving theme contrast and accessible semantics.
4. Verify keyboard/focus, light/dark and narrow layouts, missing/stale/no-report states, addon boundaries/budget, docs, full checks, static build and packed consumers. Record exact limitations.
5. Commit and merge to local main and refresh the source-bound local demo report.
