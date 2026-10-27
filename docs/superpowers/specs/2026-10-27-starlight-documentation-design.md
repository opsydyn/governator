# Governanator documentation site

## Purpose

Give a design-system maintainer a reliable way to learn Governanator, complete practical tasks, look up exact interfaces and understand governance decisions. Explain where Changesets fits: Changesets records intended package bumps and release notes; Governanator evaluates the exact candidate, compatibility and available evidence. A Changeset alone is not approval or publication authorization.

## Structure and content

Build a private Astro Starlight app in the existing Bun/Moon monorepo. Organize its navigation around Diátaxis: learning-oriented tutorials, task-oriented how-to guides, factual reference, and conceptual explanation. Provide a useful landing page with clear paths into each category and the current local-preview status. Use Starlight's responsive navigation, search and accessible default components; keep the presentation practical and focused on documentation rather than an invented marketing site.

The first complete content set covers a reproducible local dogfood tutorial; addon setup, Vitest evidence, MCP and Changesets/release how-tos; CLI commands/exit codes, report schemas, policy/data contracts and MCP tools; and explanations of lifecycle/readiness/release, evidence/provenance and Changesets. All commands and examples must match the current repository. Label deliberately blocked examples and limitations accurately, including schema 1 default/schema 2 opt-in, local fixture-only trust, private `0.1.0` packages, disabled publisher, no authenticated review, and unknown publication/deployment.

Audit and correct stale current-facing repository docs while retaining dated plans, audit findings and verification records as historical evidence. Avoid representing unverified provider, registry, screen-reader, hosted CI or production behavior as established fact. Avoid duplicating long historical records as current instructions; link to or identify them as source-checkout material where appropriate.

## Runtime, boundaries and verification

Use pinned compatible Astro/Starlight versions available in the local cache where possible; Bun remains the package manager/runtime, Moon owns tasks, and Astro telemetry is disabled. Register the site in the workspace and expose explicit dev/build/check commands. The normal repository check must validate the site, including links and Astro types where practical. Do not add a deployment workflow, public URL, remote changes, push or publication. Keep all other packages and release controls private/disabled.

Run frozen offline dependency installation, site build and checks, full workspace checks/build and an independent content/code review. Exercise the locally built site in a real browser at desktop and narrow viewport sizes, checking category navigation, search, and key pages. Record actual observations, blocked checks and any dependency/cache limitations. No screen-reader or hosted acceptance claim follows from a local browser test.
