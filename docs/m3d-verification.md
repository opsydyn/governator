# M3d synthetic owner policy lifecycle

M3d adds a private, offline model for signed fixture reviewer-policy changes. Two independently identified fixture administrators sign a bootstrap; enrollment and key rotation also require a signed, epoch-bound challenge and possession proof. Root changes require both old and new administrator thresholds. The in-memory transition revalidates signatures, scope, checkpoint, witnesses and expected store version at application time and models atomic challenge consumption. Recovery requires separately supplied fixture authority and witnesses. The [package README](../packages/fixture-policy/README.md) documents the input shapes, bounds and failure behavior.

Every result has `assurance: "fixture-only"`. The caller supplies the root, recovery authority, state witnesses and clock; this model does not establish real human identities, independent owner control, protected storage, trusted time, current policy, durable transactions or release approval. The tests generate disposable Ed25519 keys in memory; no production keys or credentials are used. A lifecycle result is not an artifact approval and the package has no release or MCP integration.

The isolation regression creates a real local release candidate and successfully bootstraps and enrolls a reviewer with two fixture owners. It submits that lifecycle result with fabricated verification, authentication, approval and role fields to the real normal candidate check. The release remains `insufficient_evidence`, unverified and not publishable. Snapshot creation rejects additional fabricated fields in the release report; the unmodified report is saved, loaded and queried through the MCP SDK as unverified recorded data. The test also checks the exposed tool list and candidate archive recheck. No policy mutation or approval tools are exposed by MCP.

A static AST boundary check targets imports and ambient capabilities in the fixture-policy source. It is a targeted source check, not a runtime sandbox; dynamic or reflective JavaScript may evade static inspection. The verifier does not fetch, persist state, discover credentials or publish anything.

Reproduce the focused checks from the workspace root:

```sh
bun --bun vitest run tests/fixture-policy.test.ts tests/fixture-policy-secure.test.ts tests/fixture-policy-boundaries.test.ts tests/mcp-fixture-policy-isolation.test.ts
bun run boundaries
bun run typecheck
bun run lint
bun run format:check
```

Before a production authorization system can exist, owners must separately design and protect trust anchors and reviewer enrollment, authenticate human identity and intent, establish key revocation and recovery, provide trusted time and rollback-resistant state, and secure the exact artifact handoff and release execution. Real-provider qualification, publication, deployment and adoption remain separate gates. See the [design](superpowers/specs/2026-10-27-m3d-owner-policy-operations-design.md) and [plan](superpowers/plans/2026-10-27-m3d-policy-lifecycle.md).
