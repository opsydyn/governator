# Storybook descriptive tag editor — local verification

Date: 2026-10-28. Source commit `e658a45184ededdcd94e270de7badc542adc774a`. This records a local feature check, not publication, hosted qualification, full accessibility conformance or completion of the entire 0.1.0 Storybook roadmap.

## Results

- `bun run check` passed 655 tests in 55 files and all 18 Moon tasks, including the addon dependency boundary, generated protocol and documentation links. The browser manager was 114,360 bytes raw / 14,477 bytes gzip against its 131,072 / 16,384 budget.
- `bun run storybook:build` passed. Storybook's existing vendor chunks triggered the greater-than-500-kB warning; the separate addon manager budget passed.
- `bun run dogfood:report` used the clean source commit above and generated an unverified local schema-2 report. The intentionally insufficient patch release remained blocked.
- The real React/Vite demo saved the descriptive tag `actions` into Button's story file. Storybook reindexed it, exposed it in the native filter, showed only matching component entries when selected and retained the tag after reload. The panel continued to distinguish descriptive tags from the readiness and release decisions.
- A packed addon with SHA-256 `be418b4b18e7e4aa0e047ebb93eeae6e5213fac0fdf3b29a0acd578789afe11b` was built from the recorded source and installed into isolated npm and strict-peer pnpm React/Vite consumers. Both built Storybook 10.6.4 with and without a copied schema-2 report using the opt-in editor configuration. In each consumer's local dev server, a browser added and saved `forms` to its independent story file and observed the new tag in Storybook's native filter. The report was not required for editing.
- The local consumer harness proved loopback access and external-network denial before installation. Third-party dependencies came from reconstructed Bun-cache archives, not verified npm registry tarballs. Lifecycle scripts were disabled; pnpm warned that reconstructed metadata lacks publication times. Evidence is retained locally under `artifacts/addon-consumer-_mvk0zu9/`.
- Focused tests cover literal CSF editing, reserved tags, unsupported metadata and source comments; rejection of out-of-project, non-story and symlink paths; file mode preservation; revision conflicts and concurrent saves within one process; same-origin loopback checks; editable and static read-only UI states; and typecheck build ordering. A local request with an external Origin was rejected with HTTP 403 and an out-of-project path with HTTP 400.

## Scope and limitations

The editor is opt-in for a local React/Vite development server. Static builds do not write files. Tags affect the selected CSF file's component metadata, not other files for the same component, and cannot grant governance approval. Unsupported dynamic CSF syntax is rejected. Optimistic revision checks and an in-process queue detect common conflicts, but independent writers do not share a lock. Storybook's internal CSF parser is used and qualified only with the pinned 10.6.4 combination. Other renderers, remote editing, screen-reader and human acceptance, accessibility conformance, registry integrity, hosted CI and publication remain unqualified. Governance-derived sidebar filtering and the broader release-history and external-evidence roadmap remain open.
