# M0 execution ledger

Plan: docs/implementation-plan.md. Authority: docs/reference/CODEX_HANDOFF_DESIGN_SYSTEM_GOVERNANCE.md plus the user's Moon/Bun/name/release-tooling changes.

- Ruling: bootstrap in the user-selected empty directory on codex/m0; no existing checkout or commits exist from which to create a worktree. No commits/pushes/publication are required.
- Ruling: retain Vitest from the approved handoff and run it through Bun; use Bun for CLI/runtime and package installation.
- Ruling: use the current reference repository's Changesets/tsdown/provenance conventions, but release workflow is manual and requires explicit future activation. No release command will run during M0.
- Pre-flight: core consumes plain protocol types; versioning consumes validated contracts; CLI owns filesystem/source/clock context. Trust assertions from input documents cannot create trusted context.

- Ruling: Moon requires HEAD, so create an empty local bootstrap commit and local main pointer. No source commit, push or publication.
- Domain/evaluator/versioning: first RED missing modules; 36 assertions GREEN after implementation and valid replacement fixture correction. CLI/protocol first RED missing modules; 44 assertions GREEN.
- Ruling: filesystem adapters live in CLI; canonical JSON/hash and tests have narrowly scoped lint exceptions because serialization and deliberately invalid inputs are their purpose.

- Tasks 1-6 implemented: four private packages, schema/evaluator/versioning foundations, CLI, generated protocol, fixtures, docs and disabled release template.
- Ruling: pin Moon's vendor Bun to 1.4.2 after observing an inherited 1.4.3. Cost: Moon updates its local proto runtime cache metadata.
- Ruling: CLI source maps disabled to avoid the pinned tsdown fake-JS declaration sourcemap warning; cost: less detailed CLI debugging maps.
- Final review: independent read-only reviewer; no Critical, two Important, one Minor.
- Final: fixed in-root symlink source-attribution gap — regression RED (validate returned 0), GREEN (input error 2); reject symlinked inputs conservatively. Cost: symlinked input projects unsupported in M0.
- Final: fixed prerelease/0.x stable readiness — two regressions RED (ready), GREEN (blocked); full suite 52/52.
- Final: minor (deferred): private assessVersion permits npm-style v-prefix/whitespace while registry schemas require canonical SemVer. No false minimum-bump acceptance was found.
- Final: Ruling: API extraction, genuine report import, Changesets release enforcement and Storybook remain M1; MCP M2; external identity/publication/deployment M3. Costs: M0 cannot claim production or hosted qualification.
- Final: Ruling: hash authenticity against replacing both fixture and expected hash remains a reviewed-file trust boundary. Cost: hashes do not authenticate publication.
- Final: Ruling: final local check/build evidence is collected by the implementer; reviewer did not duplicate execution. Publication remains unavailable because all packages are private and workflow is disabled.

- Final verification: root frozen install; all 7 Moon check tasks (52/52 tests); all 4 builds; four publint passes; four local tarballs; Changesets status; built CLI exits 0/1/2; dependency-free packed protocol consumer typecheck.
- Clean-copy verification: no node_modules/dist/workspace cache, frozen install and full checks/build pass with Bun 1.4.2.
- Final source state: uncommitted implementation on codex/m0; only empty bootstrap commit exists; no remote, push, publish or release execution. Detailed evidence: docs/verification.md.

- User authorized local M0 commit and progression to the next step. M0 check/build repeated before committing; implementation snapshot committed on codex/m0. No push or publication authorized.
