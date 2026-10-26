# M1 evidence slice

Authorized by the user's request to commit M0 and move to the next step. M0 base: b7622ba. The next bounded slice is genuine Vitest JSON import and a local runner-to-gate path, not completion of all M1.

## Design and boundary

Use a pure report adapter plus a Bun CLI runner. A report file can claim success but cannot prove who ran it, so `evidence import` always emits `unverified` records. A `check` command runs the already-installed Vitest 4 CLI with fixed arguments, validates a clean Git snapshot before and after, and supplies attestations only in memory. No shell commands from config, no external approvals, no publication/deployment claims.

Component-to-test mappings are explicit and version-controlled. Each mapping names complete test files, not fuzzy component names or arbitrary glob selectors. A file with failed assertions is failed; missing, empty or skipped-only coverage cannot pass. Mixed passed/skipped assertions do not count as complete required proof. Malformed, duplicate, inconsistent and unexpected reports fail closed. Raw imports bind to an explicitly declared source context, while local check uses Git HEAD and host-observed run times.

## Tasks and interfaces

1. `packages/core/src/vitest.ts`: strict consumed-field schemas, `decodeTestMap(raw, registry)`, `importVitest(rawReport, { root, registry, mapping, commit, repository })` returning versioned evidence and missing-file diagnostics. Report shape tolerates upstream metadata; semantic fields do not.
2. `packages/cli/src/evidence.ts`: import JSON from contained files; run the installed Vitest 4 binary and tracked config/test files without a shell, capture a fresh report, require clean entire repository before/after, bind timestamps and source, evaluate using the core. Application-owned in-memory digests cannot be supplied by disk.
3. Extend CLI commands with `evidence import --format vitest --file PATH --mapping PATH [--commit SHA]` and `check --mapping PATH [--format json|text] [--component ID]`. Commands print JSON/report to stdout for artifact redirection. Imported evidence is not automatically installed as governance evidence.
4. Real-process tests generate pass, failed, skipped and empty Vitest reports and run the CLI against local temporary Git repositories. Validate wrong source, skipped coverage, malformed/forged reports, path safety and clean snapshot requirements. No mocks for the test-run boundary.
5. Document usage, provenance limits, actual local checks and remaining M1 work. Run Moon check/build and a fresh read-only review before local slice commit.

Review focus: copied/edited reports receiving trust; missing or skipped tests passing; runner failure outside mapped files; dirty or changed source during execution; duplicate mappings/reports; untrusted paths/CLI flags; future report time; output JSON cleanliness.

The adapter proves only that the named local test process produced the imported report under the configured local trust policy. Repository test/config code can execute code and is trusted when the user invokes `check`. Hostile code with the same OS privileges is outside this local attestation boundary. Cryptographic CI identity remains M3. No new dependencies are needed.
