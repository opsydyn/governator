---
title: Check Changesets against an exact release candidate
description: Capture a tarball and verify intended bumps against actual compatibility and evidence.
---

Use the full clean, committed checkout, Bun 1.4.2 and installed pinned dependencies. Generated candidate directories must be new direct children of ignored `artifacts/`.

```sh
bun run governator release candidate \
  --config governance/release.json --out artifacts/my-candidate
bun run governator release check --config governance/release.json \
  --candidate artifacts/my-candidate/candidate.json
```

Capture exit 0 means the artifact was captured. Check exit 0 means eligible under the requested local policy; 1 means blocked/insufficient evidence; 2 means invalid input, integrity failure or runtime failure. In this checkout expect check exit **1**: removing Button's `tone` prop requires major, while package `8.4.2` and contract `1.2.1` declare patches.

`bun run release:plan` captures and checks together. `bun run release:demo` exercises isolated blocked patch/minor and simulated reviewed-major cases. The demo's major uses package `9.0.0` and Button `2.0.0`, migrated local consumers, tests and required documents. Its `eligible_under_demo_policy` result retains `publishable=false`; ordinary mode rejects simulated review.

When preparing intent, enumerate every pending `.changeset/*.md` except `README.md` in the release config. The pinned Changesets parser reads real declarations. Distributed changes require applicable non-none intent, and the exact resulting package version must match the candidate. Component contracts and the shared package version are separate checks. Required migration guide, manual migration plan, impact and compatibility matrix documents must be tracked and substantive.

This checkout already contains proposed candidate versions. Apply stock Changesets versioning only on a separately prepared pre-versioned release branch; applying it again here double-bumps the candidate. These instructions do not run versioning or publication. The root release command remains disabled. The 0.2.0 workflow defaults to rehearsal and selects retained archives using tracked hashes. Remote staging and a hosted archive rehearsal have passed; manual acceptance and npm publication remain pending. Publication requires a separate explicit decision. Local/demo results alone do not authorize publication.

See [how intent binds to bytes](../../explanation/changesets-and-exact-candidates/).
