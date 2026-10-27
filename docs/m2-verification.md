# M2 local verification — 27 October 2026

Implemented locally on `codex/m2-readonly-mcp`, based on main `088be69`. Nothing pushed, published, versioned or installed into a client configuration. M2 was fast-forwarded onto local main at `877b5c9`.

## Verified behavior

- Immutable snapshot export/load and fourteen shared queries; recorded reports remain unverified/simulated, and pure evaluation uses empty attestation maps.
- CLI export/query parity, SDK discovery/input/output schemas, typed query errors, readonly annotations and actual Bun stdio client calls.
- Parallel requests, pre-dispatch cancellation, legacy and current protocol exchanges, JSON-RPC stdout, orderly EOF, stderr-only startup failures and immutable loaded state.
- Bounds, traversal/symlink rejection, source/digest/schema mismatches, empty/paginated registries, unavailable history, missing evidence and explicit output-size errors.
- Actual packed baseline/candidate, compiler results and migration documents. Prompt-like document content stays data. Unbumped differing contracts with the same declared version return ambiguity rather than selecting hidden contents.
- Earliest report/release/candidate/snapshot expiry enforced during actual reload and each query. Configured Git clean/process filters and gitlinks reject before status; filesystem monitors/hooks are disabled per Git invocation.

`bun run check` passes all nine Moon tasks: **137/137 tests across 25 files**, TypeScript, oxlint/Effect rules with no warnings, formatting, generated protocol freshness, dependency/IO boundaries and addon checks. `bun run build` passes all eight package build tasks. The addon remains **125,190 bytes raw / 15,123 bytes gzip**, below 128 KiB / 16 KiB, with its sole Storybook peer and no MCP/Effect runtime dependency.

## Real app qualification

Explicit operator commands generate fresh evidence before read-only export:

```sh
bun run dogfood:report
bun run release:demo
bun run storybook:build
bun run governanator snapshot export \
  --report artifacts/dogfood-governance.json \
  --release artifacts/dogfood-release.json \
  --config governance/release.json \
  --out artifacts/m2-snapshot-final.json
bun run mcp:smoke --snapshot artifacts/m2-snapshot-final.json
```

The final smoke uses the built MCP executable and SDK client, compares all fourteen envelopes with the service, compares the CLI report with both Storybook input and built static JSON, and inventories tracked source, Git index and artifacts before/after. Its qualification-only preload rejects filesystem mutation, network calls and subprocesses after startup; startup permits only fixed read-only Git commands. Negative tests prove interception fires. This is application evidence, not kernel isolation.

The first smoke correctly rejected a concurrently changing build log; serial execution passed. A later static check caught Moon returning an old built Storybook report despite a new ignored public input. The actual comparison was observed RED, uncached rebuild GREEN; Storybook build caching is now disabled and the smoke permanently asserts static-report parity. CI command order generates the report before building Storybook.

Release demonstrations preserve: patch/minor blocked; major without review insufficient; explicitly simulated reviewed major eligible only under demo policy; normal major insufficient; altered exact tarball exit 2. Snapshot queries preserve the recorded decisions and simulated labels. The ordinary dogfood release remains blocked for its intentionally insufficient version bump. Publication, deployment and adoption remain unknown.

Evidence logs and generated bundles are local ignored artifacts: `artifacts/m2-final-check.log`, `m2-final-build.log`, `m2-final-dogfood.log`, `m2-final-release-demo.log`, `m2-final-storybook-build.log`, `m2-final-export.log`, `m2-final-smoke.log`, plus the final snapshot. Read each report's `sourceCommit`/`snapshotDigest` for exact identity; fresh reports are regenerated after the clean closeout commit.

## Independent review

One fresh-context reviewer inspected `088be69..9907cb0`: three Important findings and no Critical/new Minor findings. The single fix pass in `ea59ea2` addressed all three with observed RED→GREEN regressions, including separate candidate/release expiry cases and a real packed ambiguous-version fixture. The full 137-test suite passed afterward. Subsequent static-app qualification found and fixed the cache issue above. No second independent review was requested; subsequent edits receive regression/full-suite/operator verification.

## Remaining gates and recommendation

Hosted CI/required checks, actual Codex/client activation, authenticated reviewer identities/npm provenance, publication/deployment, and human browser/keyboard/a11y acceptance are unverified. Synchronous query computation is not preemptively cancellable mid-call. Git LFS/custom-filter and submodule repositories need a separately qualified source adapter. Existing SemVer-prefix and raw Vitest summary-counter limitations remain outside M2.

Recommended next: a bounded M3 trusted-review adapter, binding authenticated reviewer identity, roles, source, policy, input/artifact digests, expiry and replay rules. This addresses the remaining normal-release review gap while retaining separate publication authority. Do not activate hosted services or publish as part of that recommendation.

See [launch runbook](mcp.md) and [execution decisions](superpowers/plans/2026-10-27-m2-progress.md).
