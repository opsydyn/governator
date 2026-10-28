# Single-maintainer publishing adapter local qualification

**Goal:** Qualify a non-publishing coordinator for the reviewed 0.1.0 archive set and its partial-release recovery behavior.

**Architecture:** Validate the complete source, candidate digest, exact package set and byte snapshots before contacting an injected registry port. Preflight all versions. Treat already-present exact bytes as verified, reject conflicts and unavailable reads, send missing bytes in order, then require exact readback. An ambiguous transfer or readback stops immediately and records an unknown outcome; retry begins with fresh preflight. The only runnable transport is an in-memory local fixture; no npm credentials, real registry client or release workflow activation are added.

**Constraints:** Keep the previous archives intact. Never describe fixture approval, identity, immutable custody, hosted OIDC, scope ownership or public-registry readback as qualified. Two-owner custody remains deferred. No push, tag or publication.

- [ ] Prove with tests that mismatched source, review digest, archive identity or bytes cannot contact the registry.
- [ ] Exercise exact readback, existing matches, conflicts and unavailable preflight.
- [ ] Exercise partial success, ambiguous responses, failed or mismatched readback, and safe retry.
- [ ] Run the coordinator on the retained candidate against a no-network local fixture; preserve evidence.
- [ ] Review, run checks, merge to local main and document remaining external prerequisites.
