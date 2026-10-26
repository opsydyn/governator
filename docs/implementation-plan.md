# Governanator M0 implementation plan

Approved scope: repository/domain bootstrap, deterministic evaluation, component versus package version semantics, immutable local baseline fixtures and minimal CLI. User changes: Moon, Bun, tsdown, Changesets, oxlint with @opsydyn/oxlint-effect, oxfmt. Keep all work local; do not publish or push.

1. Establish four packages: dependency-free protocol, private core and versioning, CLI. Configure Moon/Bun checks and tsdown ESM builds.
2. Test-first schemas and registry/policy/evidence validation, stable identities and safe filesystem paths.
3. Test-first pure readiness evaluation with explicit time/source/trust context, gate precedence, transitions and waiver limitations.
4. Test-first version classification, SemVer rules and digest-checked baseline fixtures. Actual API analysis and release enforcement remain M1.
5. Test-first CLI validation/evaluation, deterministic JSON and exit codes 0/1/2; explicitly isolated demo fixtures.
6. Generate/check protocol, verify dependency boundaries and built packages, document trust model and run all checks.

Review focus: forged approvals, conflicting evidence, time boundaries, symlink/path escape, malformed/unsupported schemas, baseline tampering, component/package version confusion, demos mistaken for real evidence.
