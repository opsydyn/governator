# Sealed archive custody qualification

**Goal:** Test a Linux archive handoff that makes reviewed bytes immutable before npm reads them, without enabling or performing a real publication.

**Architecture:** Validate the complete candidate set and digest before use. On an isolated Linux runner, copy each snapshot into a sealed memfd, expose it through a root-owned path to an unprivileged npm child, and verify the child cannot modify either the descriptor or its path. Confine a dummy npm registry and npm client to an isolated network namespace, compare uploaded bytes to the reviewed hashes, and retain a non-publishing receipt. A separately authorised production workflow, identity/permissions, secure runner configuration and real registry behavior remain unqualified until verified.

**Constraints:** No real token or external publication in the fixture. No bypass of the existing disabled release workflow. Existing exact candidate archives remain preserved. The user has deferred multi-person custody.

- [ ] Test candidate and byte binding before introducing a Linux custody fixture.
- [ ] Run actual npm against a loopback-only fake registry using sealed descriptors; prove write/truncate and symlink replacement fail.
- [ ] Add an isolated qualification job, test locally where possible and run it on GitHub Linux.
- [ ] Independently review, run checks, and record evidence and remaining permission/publication limits.
