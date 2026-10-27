# M3b GitHub source-review reader

M3b adds a private GitHub review-list collector. It has no default network transport, credential discovery or client activation: a caller explicitly supplies the repository/PR scope, collection time and a transport. Local tests use fake responses only. Every result is an **unverified source observation**, never a reviewer-approval capability.

The collector confines requests to GitHub's review-list endpoint, directs the transport to disable redirects before a request, validates pagination and response scope, limits page count and streaming bytes, normalizes supported timestamps, and returns sanitized incomplete/unavailable results for malformed, partial or unavailable data. No review body or credential is returned. The caller-supplied transport must honor the redirect/credential-handling contract; a future real transport needs independent qualification before use.

The [private package API](../packages/github-review/README.md) describes the injected transport, precise bounds and response shapes. The caller-supplied collection timestamp is not an independently verified clock. Cancellation cannot force an uncooperative transport to stop its own work.

A provider-reported end of pagination does not prove cross-page consistency or current PR head. A review record does not prove current role authorization or bind an approval to a specific packed artifact. GitHub review bodies are editable; they cannot serve alone as an immutable artifact attestation. The normal release gate remains insufficient without a trusted review integration. Saved data and MCP outputs remain recorded observations, and publication, deployment and adoption stay unknown.

To reproduce local verification from the workspace root:

```sh
bun --bun vitest run tests/github-review-reader.test.ts tests/mcp-github-review-isolation.test.ts
bun run check
bun run build
```

The [approved design](superpowers/specs/2026-10-27-m3b-github-review-reader-design.md) defines limits, trust boundaries and adversarial coverage. No GitHub requests or credentials are used by the local test suite. Actual GitHub qualification needs an explicitly selected repository and access method, followed by separate independent reviewer-role authority and authenticated immutable artifact binding.
