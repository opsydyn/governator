# First-project onboarding automated qualification

Implementation commit: `d462bfd`. All additions are local source for the next release; published 0.1.0 is unchanged. Manual acceptance remains deferred until last.

`bun run check` passed all 18 tasks, including 830 tests across 80 files, lint, typechecking, formatting, dependency boundaries, protocol freshness, addon budget, documentation build and internal links.

Focused automated cases cover setup preview without writes, digest-bound application, changed plans, explicit ownership, existing destinations, symlink parents, skill export and references, capability discovery, CLI-only optional dependencies, evidence-workflow missing dependencies, and structured read-only remediation arguments. Existing authoring, snapshot and MCP tests also pass.

Dependency diagnostics initially used Bun's resolver, which could observe this executable's workspace rather than the selected consumer. Diagnostics now inspect installed manifests in the selected project's dependency ancestry. A clean CLI-only fixture succeeds without optional MCP/addon packages or selected artifacts.

The first full check caught a build-option regression from chaining the asset-copy command after tsdown. Skill copying now runs in tsdown's post-build hook using the actual resolved output directory. Regression checks verify both rejection of symlinked cleanup targets and a successful custom output directory containing the bundled skill. The final full suite passed after the fix.

The final independent packed CLI/MCP rehearsal passed. Evidence is retained in ignored `artifacts/cli-mcp-consumer-IyxdCK/summary.json`, with the consumer in `/private/tmp/governator-consumer-kGrwDS`. It exercises installed capability discovery, CLI-only diagnostics, skill export and overwrite refusal, fresh-project plan/apply/validate and overwrite refusal, local producers, snapshot creation and all fifteen MCP queries with CLI parity. The exported SKILL.md and setup reference also matched repository source byte-for-byte.

The rehearsal uses a confined loopback registry and third-party archives reconstructed from extracted Bun cache with preserved manifests. It is local packed-consumer evidence, not live npm publication, original third-party archive integrity, or a versioned 0.2.0 candidate. The archives still use the current unversioned local manifests. Preserve ignored raw evidence separately if it must outlive this checkout.

Remaining release work: prepare and qualify a versioned candidate, then perform the deferred browser, keyboard, accessibility and human onboarding walkthroughs before any separately authorized publication. No push or publication occurred during this work.
