# Retained 0.2.0 publishing adapter

This prepares the single-maintainer workflow locally. It does not publish, stage a GitHub release, upload assets, dispatch Actions or push main. Manual acceptance remains last. The [candidate qualification](0-2-candidate.md) still describes the selected source and exact retained bytes.

## Prepared path

The tracked `governance/publishing/0.2.0.json` pins the three archives from source `cfd81a9f7a2285a42ad850498071693b8d8cbf7a`, including their names, sizes, SHA-256 and SHA-512 integrity. The private Node 24 adapter `scripts/publish-retained.ts` reads those pins from the checkout. A downloaded record cannot replace them.

The manual, main-only release workflow downloads three assets from the draft release `governator-v0.2.0-candidate`. The release tag locates bytes; the tracked hashes select them. The workflow never builds, packs or installs project dependencies. Rehearsal defaults to npm dry runs, without NPM_TOKEN. Live publishing requires mode publish and the literal confirmation `publish-governator-0.2.0`; NPM_TOKEN is exposed only to that step.

Before any upload, the adapter verifies all retained files and preflights all three npm versions. Exact existing versions are skipped. Different bytes, authentication failures, rate limits or unavailable observations stop the run. It checks each missing version again immediately before sending. After a successful npm command, bounded polling tolerates a temporarily absent version, then downloads and hashes its tarball. An upload failure is uncertain and stops immediately. Rerunning checks npm again; it never blindly retries a failed upload.

Staging uses private temporary files and checks their hashes before and after npm. The model trusts the operator and runner; it does not claim protection from another process with the same user's privileges. Sealed-file custody and dual control remain deferred. npm provenance will describe the publishing workflow; it does not authenticate the earlier local build or constitute human acceptance.

## Local rehearsal

From the repository root, these commands require no publication credentials:

```sh
node scripts/publish-retained.ts verify artifacts/governator-0.2.0-t2XKLi
node scripts/publish-retained.ts rehearse artifacts/governator-0.2.0-t2XKLi
```

The second command runs npm publish --dry-run on each retained tarball with scripts disabled and provenance disabled. Successful dry runs do not establish live npm permissions or OIDC/provenance behavior.

Evidence is retained in `artifacts/publisher-0.2.0-JgPRAS/`. The loopback fixture ran the same Node adapter with the real npm client under macOS network confinement. An external connection returned EPERM, while actual npm PUT/GET operations succeeded on loopback using a dummy token. Received attachments matched the retained hashes. The fixture exercised delayed visibility, an uncertain acknowledgement after the second upload, a rerun that skipped both already accepted archives, and rejection of conflicting bytes before any new upload. Exactly three fixture uploads occurred. All three dry runs also succeeded with all networking denied. Original archives remained unchanged.

Seven focused automated tests cover filesystem links, changed bytes, incomplete package sets, all-package preflight, unavailable observations, unknown upload outcomes, delayed readback, conflicts, response limits, redirects, wrong identities, live-mode guards and workflow credential boundaries. The full workspace check passed all 18 tasks, including 837 tests across 81 files, lint, typecheck, formatting, protocol and dependency checks, addon budget and documentation build/links. Log: /private/tmp/governator-020-publisher-check.log. Package and onboarding-skill sources are unchanged from the candidate commit.

Fresh read-only review found no Critical or Important blockers and independently verified the retained pins using native Node. The updated release guidance also passed a subsequent documentation build and internal link check. No live publication or remote qualification is inferred from these local results.

## Remaining remote and manual steps

After separate authorization for remote staging, push the reviewed main branch and stage the already retained archives. Do not rebuild, repack or use --clobber. Check existing release assets before retrying a partial staging command.

```sh
gh release create governator-v0.2.0-candidate --repo opsydyn/governator --draft \
  --target cfd81a9f7a2285a42ad850498071693b8d8cbf7a \
  --title 'Governator 0.2.0 candidate' --notes 'Retained local candidate; publication pending.'
gh release upload governator-v0.2.0-candidate --repo opsydyn/governator \
  artifacts/governator-0.2.0-t2XKLi/opsydyn-governator-cli-0.2.0.tgz \
  artifacts/governator-0.2.0-t2XKLi/opsydyn-governator-mcp-0.2.0.tgz \
  artifacts/governator-0.2.0-t2XKLi/opsydyn-storybook-addon-governator-0.2.0.tgz
```

Then run the workflow in rehearsal mode and inspect the downloaded bytes and result. These GitHub commands, draft-asset access, Linux execution, current npm token permissions, hosted OIDC/provenance and live npm propagation have not been exercised in this local preparation. Preserve the exact archives until those steps complete.

Finish the deferred visual, keyboard, accessibility and human onboarding walkthroughs before separately authorizing publication. The historical non-publishing release-qualification workflow and its 0.1.0 custody fixtures remain historical tools; they do not qualify this 0.2.0 path.

Implementation follows the [local execution plan](../superpowers/plans/2026-10-29-0-2-publishing.md). The native Node path uses no new dependency. npm tarball/dry-run behavior and release asset download options follow the [npm publish documentation](https://docs.npmjs.com/cli/v11/commands/npm-publish/) and [GitHub CLI documentation](https://cli.github.com/manual/gh_release_download).
