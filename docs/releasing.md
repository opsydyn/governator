# Release conventions

The reference is [opsydyn/oxlint-effect](https://github.com/opsydyn/oxlint-effect): Bun install/build, tsdown ESM and declarations, Changesets version/release PRs, `changeset publish`, `publishConfig.access: public` and `provenance: true`. Its current release workflow uses `changesets/action` and npm token authentication (`NPM_TOKEN`/`NODE_AUTH_TOKEN`) plus GitHub OIDC permission. The reference manifest/workflow were inspected during implementation.

Governanator adopts those build/config conventions. `bun run changeset` creates release intent, `bun run version` applies it locally, and the release script checks/builds before Changesets publishing. None of those mutating release commands was run during M0. Packages are independently versioned and all remain `private: true` until qualified. The scope/package names are local choices; registry name availability and publishing ownership have not been verified.

`.github/workflows/release.yml` is an explicitly disabled, manual-only template. It cannot run on push and its release job is skipped. Activation requires a later publishing decision, qualified package surfaces/tarballs, actual repository metadata, registry scope ownership, credentials/provenance configuration and appropriate GitHub environment protections. No external setup was performed.

Internal core/versioning remain private implementation details. Before a CLI release, package its private engine correctly (bundle it or publish a deliberate backend distribution), because a consumer cannot resolve unpublished workspace packages. Before an addon release, run the handoff's independent clean npm/pnpm Storybook installations and dependency/bundle budget gates. M0 packed manifests are inspected locally, but no external consumer installation is claimed.

Changesets manages package intent; the component governance engine must independently enforce compatibility and required migration/review proof in M1. A Changeset alone is never approval.
