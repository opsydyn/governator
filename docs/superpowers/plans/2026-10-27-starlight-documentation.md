# Starlight Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Deliver accurate, locally buildable Diátaxis-organized Governanator documentation.

**Architecture:** A private `apps/docs` Astro Starlight workspace supplies navigation and current consumer content. Existing historical handoffs, audit and verification records remain in the repository; stale live guidance is corrected rather than copied unquestioned. Moon and Bun run site checks with no publishing or deployment.

**Tech Stack:** Bun, Moon, Astro, Starlight, Markdown/MDX, TypeScript and oxfmt.

**Spec:** `docs/superpowers/specs/2026-10-27-starlight-documentation-design.md`.

## Global constraints

- Local only; no push, publish, deployment, credentials or remote changes; packages remain private `0.1.0` and release is disabled.
- Use actual Starlight and accessible responsive navigation/search. Do not invent a production URL, approval, evidence, installation or hosted qualification.
- Diátaxis navigation must contain substantive tutorials, how-to guides, reference and explanation; examples match current code and source-bound local behavior.
- Preserve dated historical records; distinguish real local evidence from simulated or unverified results and from published/deployed state.
- Offline Bun cache first; do not silently substitute a lookalike for Astro/Starlight if dependencies cannot be installed.

## Review focus

- Commands and sample inputs must work in their stated context; expected blocked results and nonzero exit codes must be explicit.
- Changesets intent, exact candidate/review evaluation and disabled publication must not be conflated.
- v1/v2 report compatibility, 24-hour freshness and unverified serialized evidence must be accurate across pages.
- Links, routes, search and keyboard/narrow navigation work in a built site; unknown deploy URL must not create broken base paths.
- Moon cache inputs and check graph must cover documentation/config changes without disturbing existing package builds or addon dependency budgets.

## Task 1: Site scaffolding and monorepo integration

**Files:** `apps/docs/package.json`, `apps/docs/astro.config.mjs`, `apps/docs/src/content.config.ts`, `apps/docs/src/styles/`, `apps/docs/moon.yml`, `.moon/workspace.yml`, root `package.json`, `moon.yml`, `bun.lock`, `.gitignore`, build tests as appropriate.

- [ ] Add a real, private Starlight app, pinned compatible offline dependencies, responsive design tokens, clear site status and four-category navigation. Disable telemetry; use no external-hosted font or invented hosting URL.
- [ ] Add Moon dev/build/typecheck and workspace scripts; site build and Astro check must run in the normal check graph. Ensure cache inputs include content, assets and config. Install from offline cache and record exact result.
- [ ] Run site build/check, formatter/lint and workspace typecheck as applicable; independently review scaffolding and fix Important findings.

## Task 2: Current content and historical accuracy

**Files:** `apps/docs/src/content/docs/` Markdown pages, existing current-facing `docs/*.md`, selected package README files.

- [ ] Audit and correct stale current-facing documentation, preserving dated historical records. Link authoritative current material rather than inventing provider or release proof.
- [ ] Author an end-to-end local tutorial, task-oriented addon/evidence/MCP/release guides, accurate CLI/schema/MCP references and conceptual explanations including Changesets. Provide substantive content for all four sections and a useful site landing page.
- [ ] Validate internal links and representative commands against actual repo/fixtures; independently review technical claims, trust and Diátaxis structure. Fix Important findings.

## Task 3: Qualification and local integration

- [ ] Run the complete checks/build and independent whole-branch review. Test local site at desktop and narrow widths with keyboard navigation, category links and search; preserve evidence and record real results/limits.
- [ ] Commit locally, fast-forward main and rerun source-bound dogfood/Storybook/MCP plus documentation checks on the final commit; no push or publish. Recommend the next release-readiness step.
