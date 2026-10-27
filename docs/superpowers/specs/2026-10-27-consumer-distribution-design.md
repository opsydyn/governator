# Consumer distribution and local package qualification

## Intent

Prepare the `0.1.0` addon, CLI and read-only MCP for installation outside this monorepo. A maintainer should be able to use the addon with Storybook and run the CLI and MCP with Bun while the private engine remains an implementation detail. This is local release preparation; no package, tag, remote, publisher, registry or deployment is activated.

## Approaches

Publishing every internal workspace as a separate package would expose implementation APIs and require a larger public dependency and release surface. Copying workspace modules into a consumer fixture would hide unresolved package errors. Instead, bundle the private engine and Effect into the CLI/MCP artifacts, externalize and explicitly declare conventional runtime dependencies needed by the built code, and qualify actual tarballs in independent consumer directories. Preserve the addon's independent, Storybook-only consumer boundary. This approach retains the existing Changesets conventions without enabling publication.

## Distribution contract

- Keep all packages `private: true` and version `0.1.0`; preserve the root fail-closed release command and disabled release workflow. Do not run `changeset version` or publish, access credentials, push, contact a registry or change remote settings. Resolve and install exclusively from local caches or explicitly constructed local sources; document their provenance.
- CLI and MCP execute with Bun `>=1.4.2`; do not claim Node runtime compatibility. Bundle workspace-private implementation and Effect. Do not leave unresolved private workspace runtime imports, declaration imports or consumer peers. Declare every retained third-party runtime dependency, and preserve compiler library resolution for actual TypeScript API analysis. Preserve exports unless there is a justified compatibility reason to narrow them; verify public declarations as well as the bins.
- The addon remains dependency-free with Storybook as its only peer. Restrict advertised framework support to the renderer actually qualified unless more renderers are independently tested. Preserve report format, security, freshness, release-gate semantics and addon size budgets. Include license and package metadata that can be accurately specified now; do not invent repository URLs or npm ownership.
- Document addon-only and CLI/MCP setup, Bun and Storybook compatibility, how a consumer produces a report and snapshot, and the distinction between a local unverified preview and trusted release or deployment proof. For `check`, document Git, consumer-installed Vitest 4, tracked configuration/tests and ignored artifacts. Correct any stale publishing instructions.
- Never clean a build output containing symlinks to another directory; keep temporary outputs separate from dependency trees and inspect targets before cleanup. Avoid reusing a directory whose ownership or retained evidence is unclear.

## Verification

Run real builds and pack exact local candidates. Inspect packed manifests, executable shebangs, exports, declarations and internal imports; use `publint` and typecheck real consumer imports where applicable. From an independent temporary project outside the monorepo and its ancestor `node_modules`, install the packed CLI/MCP and declared dependencies from an available offline source. Exercise the installed Bun CLI against a clean committed consumer fixture, including an actual `check --report-schema 2` with its receipt and evidence metadata; generate a report and source-bound snapshot, and connect an MCP client to the installed MCP executable. Check fourteen-tool discovery and CLI/report/query parity, blocked/unknown trust state and malformed startup. Exercise a real installed CLI API-compatibility path so TypeScript's libraries resolve correctly.

Pack the current addon and try fresh independent npm and strict-peer pnpm Storybook React/Vite installs, builds and no-report/configured-report cases using available offline sources. Reconstructed dependency sources must preserve original manifests and transitive dependency semantics to demonstrate ordinary package-manager resolution; rewriting third-party manifests for local file references demonstrates only the narrower setup and must be labelled. An install that relies on workspace `node_modules`, a missing cache or a simulated registry must be labelled accurately; if required addon or CLI/MCP dependencies are unavailable offline, report those checks as blocked and retain them as explicit release gates. Do not claim npm registry or hosted CI qualification from local tarballs.

Use focused regressions, the full local check/build, independent review and a local main fast-forward. Preserve all generated qualification evidence needed for review. Remote ownership, authenticated published baselines, hosted required checks, real human approvals, screen-reader acceptance and actual npm publication remain separate.
