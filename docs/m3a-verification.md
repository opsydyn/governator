# M3a synthetic review evidence

M3a adds a private, pure evaluator for **synthetic fixture observations**. Its purpose is to exercise exact-candidate review rules before introducing an authenticated provider. Every result is marked `simulated`; neither a match nor a copied result is an approval capability. The normal release gate still requires a trusted owner-review integration and continues to fail closed when it is unavailable.

The evaluator accepts an explicit clock, expected candidate scope, a separate synthetic reviewer-authorization policy, fixture provider observations and separate synthetic artifact-binding claims. The scope covers repository host and identity, pull request, source commit, package/version, baseline and candidate artifact digests, release inputs and both release/authorization policy identity. Reviewer roles come from the supplied fixture policy, not from review-body claims. The policy hash checks internal consistency; it is not a signature or proof of authority.

The private `evaluateSyntheticReview(input)` API is exported by `@governanator/versioning`. Its output has `assurance: "simulated"` and status `matched`, `insufficient_evidence` or `not_required`, with explicit reason codes. See the [complete fixture builder](../tests/m3-synthetic-fixtures.ts) and [adversarial tests](../tests/m3-synthetic-review.test.ts) for the accepted input shape and clock boundaries. This evaluator is not connected to a CLI release command or an MCP tool.

A fixture match requires complete available observations, an unchanged source head, current authorized owner review, exact matching artifact claims and valid time windows. Unknown or contradictory status, absent roles, dismissed or superseded evidence, incomplete provider state, mismatched scope and expired/future data do not create a match. A non-distributed change reports that review is not required, not that an approval was verified. Same-scope fixture rechecks can be repeated; this does not provide durable one-use replay prevention.

This package does not fetch GitHub, read credentials, configure client settings, activate a hosted service, sign data, grant approvals or publish packages. Saved release reports and MCP snapshots remain recorded observations; copied fixture results and claimed `verified`/`authenticated` flags do not recreate a trusted host capability. Publication, deployment and adoption stay unknown.

Local verification: all nine Moon checks passed with **253 tests** in 27 files; all eight package builds passed. The standalone verifier suite passed 115 tests, and the real release candidate/SDK MCP isolation regression passed with an actual matched fixture result. The addon remains 125,190 bytes raw / 15,123 bytes gzip with the existing dependency boundary. Source-bound dogfood reports and the built MCP smoke are regenerated on final clean main. See the [design](superpowers/specs/2026-10-27-m3a-review-evidence-design.md) and [implementation plan](superpowers/plans/2026-10-27-m3a-synthetic-review.md) for detailed scope.

Reproduce the local verification from the repository root:

```sh
bun --bun vitest run tests/m3-synthetic-review.test.ts tests/mcp-review-isolation.test.ts
bun run check
bun run build
```

The next external-provider phase requires an independently managed authority for reviewer identities and roles, authenticated GitHub reads, current review and membership state, complete pagination, and a qualified immutable binding between the reviewed source and exact artifact/inputs. GitHub review bodies can be edited and do not alone prove such a binding. Hosted protection, live identity, human acceptance and publication remain separate gates.
