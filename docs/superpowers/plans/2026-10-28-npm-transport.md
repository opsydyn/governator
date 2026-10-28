# Single-maintainer npm transport implementation plan

**Goal:** Add an unwired npm transport for the existing coordinator, with bounded local qualification and no real publication.

**Architecture:** Read version metadata and download bytes only from the configured npm origin, treating errors as unavailable. Send a private snapshot to npm using isolated configuration and no lifecycle scripts. The coordinator verifies the complete candidate before calling the transport and requires exact readback. The publisher is not connected to the disabled release workflow. A process sharing the runner identity can modify the private staging directory, so this alone does not establish production immutable custody.

**Constraints:** No network except a loopback fixture during qualification; do not use real credentials, push, or publish. Preserve existing candidate and unrelated worktree edits. Do not claim production custody or hosted qualification.

- [ ] Test absent, exact, malformed, redirected, cross-origin and oversized registry observations.
- [ ] Test a failed send is uncertain, isolated npm settings and exact snapshot bytes with dummy credentials.
- [ ] Exercise actual npm against a sandboxed loopback fixture and verify received bytes and retry behavior.
- [ ] Document assumptions and unqualified hosted prerequisites; run checks, review and fast-forward local main.
