---
title: Run the local governance dogfood
description: Build real components, generate source-bound evidence and inspect a deliberately blocked release.
---

This tutorial follows the source checkout's React/Storybook example from tests to a visible report. You will see why passing local tests and a blocked release can coexist.

## Prepare the checkout

Use a full local Git checkout of this repository, Bun **1.4.2**, and the pinned Moon **2.6.4** supplied by the workspace. TypeScript **5.9.3** and Vitest **4.1.12** are pinned dependencies. Run every command from the repository root. This is a source-checkout workflow; registry installation remains unverified.

The producer requires a clean, committed tree, tracked governance inputs, no submodules or clean/process Git filters, and no assume-unchanged or skip-worktree index flags. Finish and commit your own changes before starting. Generated `artifacts/` is ignored. Installed dependencies and test/config code execute with your local operator trust.

```sh
bun --version
bun install --frozen-lockfile
bun install --cwd apps/docs --frozen-lockfile
bun run build
bun run governator validate
bun run dogfood:report
```

The root workspace and `apps/docs` use separate lockfiles; install both because the root build includes the Moon-managed documentation app. Dependency installation needs the pinned packages available through your configured source or cache. Stop on an installation/build/runtime error; a failed producer is not a governance result. `validate` checks shape, references and contained paths; it does not approve components.

## Inspect the result

`dogfood:report` rebuilds actual component declarations, runs mapped UI tests, captures a real local tarball and checks its release candidate. It explicitly emits report schema 2 to `artifacts/dogfood-governance.json` and `apps/storybook-demo/public/governance-report.json`. It also writes `artifacts/dogfood-release.json` and retains the local test receipt.

```sh
bun run storybook
```

Open `http://127.0.0.1:6006`, select Button and its **Governance** tab. Inspect the readiness, API compatibility and release sections independently. Select Select, Alert, LegacyAlert and Unmapped to compare component identity and lifecycle. Unmapped declares `ui.unmapped`, which has no matching registry decision and cannot acquire a ready badge by inference. Stop the development server with Ctrl-C when finished.

Button deliberately removes the `tone` prop from the baseline. The proposed Button contract **1.2.1** and shared package **8.4.2** are patch bumps; that removal requires a major. Expect blocked API/release results even when the limited local unit-test readiness policy passes. Publication, deployment and adoption remain unknown.

## Query the saved view

For a static view, build Storybook after producing its report, then export a snapshot to a filename that does not already exist:

```sh
bun run storybook:build
bun run governator snapshot export \
  --report artifacts/dogfood-governance.json \
  --release artifacts/dogfood-release.json \
  --config governance/release.json \
  --out artifacts/tutorial-snapshot.json
bun run governator query --snapshot artifacts/tutorial-snapshot.json \
  --tool get_component --args '{"componentId":"ui.button"}'
bun run mcp:smoke --snapshot artifacts/tutorial-snapshot.json
```

Snapshot export runs no producers. Export and reload preserve the earliest expiry; the lifetime is capped at 24 hours. Use a fresh filename on a repeat run. Saved JSON does not restore the runner's in-process evidence trust.

You now have a real local report and an immutable query view, alongside a blocked release. The main checkout has no demo Changeset; `bun run release:demo` recreates the intentionally insufficient patch in a disposable repository to exercise that specific failure. Continue with [evidence production](../../how-to/vitest-evidence/) or [the three independent states](../../explanation/lifecycle-readiness-release/).
