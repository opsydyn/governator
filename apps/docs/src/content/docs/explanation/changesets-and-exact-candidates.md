---
title: Changesets and exact candidates
description: Connect intended version bumps to the actual bytes being evaluated.
---

Changesets records intended package bumps and release notes. Governator independently evaluates compatibility and evidence for the exact candidate. A declaration of intent cannot approve a breaking change or authorize publication.

The release gate starts from clean tracked source and an explicit immutable local baseline archive. Capture builds a disposable clean clone of the commit, links installed dependencies, and packs after the explicit build with pack hooks disabled. Ignored working-tree declarations or environment files do not become candidate source. Operator-trusted build/dependency code still runs.

The candidate binds source commit, archive digest, packed manifest, every payload file's content and mode, emitted API, creation time and governance/Changesets/classification/consumer/document input digests. Check rereads the tarball, recomputes API and payload, reproduces payload from another clean build, compiles tracked consumers and reruns mapped tests. It checks integrity again instead of trusting a saved eligibility result. Archive digest is exact; reproducibility allows irrelevant tar/gzip container metadata differences while requiring matching payload bytes and modes.

The real Changesets parser must account for all pending files except its README. Distributed changes need non-none intent and exactly the resulting package version. Known changes establish a minimum bump independently of unknown changes and per-component classification. Reviewed unknowns cannot erase known breaks. Runtime changes need intent even with unchanged declarations; a packed README is also distributed output.

Contract and package versions are checked separately. The removed Button `tone` prop requires major, so `1.2.1` / `8.4.2` patches block, as does minor. The isolated demo proposes `2.0.0` / `9.0.0` and checks current simulated owner roles, exact candidate/source/input bindings, local consumers, tests and substantive migration documents. Only explicit demo mode can return `eligible_under_demo_policy`. Normal mode rejects this simulated review; `publishable` remains false in every local result.

The analyzer currently supports one root exports types entrypoint and optional package.json export. Additional entrypoints, declaration wildcards, unsafe/special archive entries and local runtime links fail closed. Candidate freshness is capped at 24 hours. Local baseline files and their expected hashes remain a reviewed-input trust boundary, not publisher authentication.

Versions in this checkout are already proposed candidates. Stock Changesets versioning belongs on a pre-versioned release branch; applying it again here causes an exact-version mismatch. Publishing is disabled and requires a separate trusted adapter. Use the [release how-to](../../how-to/changesets-release/) to inspect the deliberate block safely.
