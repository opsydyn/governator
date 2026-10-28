# Single-maintainer local release rehearsal

**Goal:** Prepare and rehearse the exact first-release package archives without making registry writes.

**Architecture:** A local candidate record binds clean source, the three package identities, sizes and digests. An explicit candidate digest represents the maintainer's local review selection, not an authenticated identity. A separate offline adapter reads and verifies the approved archives once, then transfers byte snapshots first in memory and then through npm to a loopback-only fake registry under macOS sandbox-exec. Changesets remains the source of version intent; the first release requires an empty active queue and matching 0.1.0 manifests. The real publishing command and hosted workflow remain disabled.

**Constraints:** Do not publish, create tags, push, configure credentials or change the user's dirty working tree. Do not claim npm OIDC, hosted review, production transport, immutable filesystem custody, or atomic multi-package publication has been qualified.

- [ ] Test candidate identity, source, allowed set, duplicate/missing inputs, changed bytes and explicit review digest.
- [ ] Implement offline candidate and rehearsal boundaries, including exact byte snapshots and safe archive/manifest inspection.
- [ ] Rehearse real three-package archives and verify retained artifacts and fake registry receipts; document limitations and next steps.
- [ ] Run repository checks, review, and integrate the committed work on local main.
