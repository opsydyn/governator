# M1 evidence execution ledger

Plan: docs/m1-evidence-plan.md. Base: b7622ba on codex/m1-evidence. User authorized committing M0 and moving to the next step; local-only/no push/no publication remain in force.

- M0 committed b7622ba after checks/build; main remains the bootstrap pointer. Source handoff retained original Markdown hard-break whitespace, which is the sole exception to staged diff whitespace checking.
- Scope ruling: implement the first bounded M1 evidence slice; full M1/API-release/Storybook work remains explicitly open. Optional scope clarification was offered while committing; no response changed this bounded implementation.
- Design ruling: raw imports can associate a report with declared source but never create trust. Local check can attest its own process only and cannot stand in for external approval/identity. Cost: imported CI reports need a later host verifier.
- TDD: seven pure adapter tests RED for absent module, then GREEN. Four real-process CLI tests RED for unsupported command, then GREEN with actual Vitest pass/fail/skip/source-mutation executions. Full suite 63/63; typecheck/lint/format/protocol/boundary checks and four builds pass.
- Runtime ruling: fixed installed Vitest 4 CLI arguments, tracked root config, clean whole repository before/after, unique ignored output directory and 30-second timeout. Cost: no arbitrary runner commands/config selection, no long test suites or dirty-tree checks in this slice.
- Trust ruling: receipt JSON is an audit artifact, never a reusable attestation credential. Project test/config code is operator-trusted and is not sandboxed from the local producer. Cost: no malicious-same-user isolation claim.

- Final independent read-only review: no Critical, two Important source-binding gaps, one Minor report-summary validation gap.
- Final fixed: ignored/untracked governance registry/policy could receive HEAD labels. Regression RED (ready/exit 0), GREEN (input error 2); require every consumed governance file tracked when present.
- Final fixed: assume-unchanged and skip-worktree could hide source edits. Two regressions RED (ready/exit 0), GREEN (input error 2); reject unsupported index flags across the repository. Cost: sparse-checkout/hidden-index workflows unsupported for local check.
- Final minor (deferred): top-level suite-summary counters are not fully reconciled; raw imports remain unverified. No provenance bypass was found.
- Declined-to-judge rulings: full M1/API/Storybook remains open; signed CI identity/publication/deployment and hostile same-user isolation are not claimed; declared coverage is owner-reviewed mapping rather than static proof; implementer collects local execution evidence rather than duplicating reviewer runs.

- Final verification after fixes: all 7 Moon check tasks pass, 66/66 tests, all 4 builds, built CLI real-process pass/fail/skip exits 0/1/1 with expected gates. Detailed evidence: docs/m1-evidence-verification.md. Slice ready for local commit; no push/publication.
