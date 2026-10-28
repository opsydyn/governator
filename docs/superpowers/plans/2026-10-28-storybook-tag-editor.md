# Storybook Tag Editor Implementation Plan

**Goal:** Let maintainers add and remove descriptive component tags in the Storybook addon, persist them to repository-owned Storybook metadata, and filter with Storybook's native tag controls.

**Architecture:** Keep the shipped manager read-only unless a separately enabled local development authoring adapter is available. Authoring changes statically analyzable component-level CSF tags and lets Storybook rebuild its own index; static builds show a read-only state. Governance decisions remain report-derived and independent from tags. The authoring boundary must limit writes to eligible story files under the configured project, reject untrusted origins and unsafe paths, and detect concurrent edits.

**Tech Stack:** Storybook 10.6 React/Vite, TypeScript, Bun, Vitest, Moon and local browser verification.

## Constraints and acceptance

- Descriptive tags are explicitly declared metadata and do not assert approval, readiness, publication or deployment.
- A selected component can view, add and remove its component-level tags; validation and errors are accessible; edits survive restart and appear in native filters.
- Static builds, unconfigured editors, missing or unsupported CSF shapes and readonly sources remain usable and communicate their limitations.
- Reject detected revision conflicts, serialize saves in this process and preserve unrelated source text. Other independent writers do not share a lock and remain a documented limitation. Reject symlinks, cross-origin requests and remote file mutation. No hosted service or publishing.
- Preserve the addon-only Storybook peer and browser bundle boundary, and test with independent consumers. Do not make the no-report panel depend on the editor.
- Native Storybook special tags and story-level overrides require explicit handling; never accidentally change inclusion in tests or navigation.

## Tasks

1. Specify and test CSF transformation and the bounded authoring endpoint: simple static component-level metadata, safe paths, origin/capability validation, revision conflicts, reserved tags and fail-closed unsupported syntax.
2. Build the optional development authoring adapter without introducing Node code into the browser manager or adding a consumer runtime requirement; verify static builds remain read-only.
3. Add accessible manager controls for selected component tags with saving, conflict, unavailable and recovery states, and integrate native filtering. Clearly separate descriptive labels from evaluated governance.
4. Exercise tag add, remove, filtering, reload persistence, conflicts and non-editable/static behavior in the real React/Vite demo and clean packed consumers. Run addon boundaries/budget, tests, typechecking, lint, docs and full workspace checks.
5. Document setup and limitations; commit and merge locally to main. Record any unqualified behavior rather than treating it as complete.
