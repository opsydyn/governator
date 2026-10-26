# Codex handoff — Design System Governance Control Plane

**Date:** 22 October 2026 (revised 26 October 2026)  
**Status:** implementation brief — includes normative API-grade versioning extension  
**Working name:** Design System Governance (temporary — do not spend time branding)  
**Initial license:** MIT  
**Internal stack:** TypeScript, Effect 4 / `effect/Schema` in governance tooling, pnpm workspaces, Storybook 10, React, Vitest, Model Context Protocol (MCP) TypeScript SDK v2. **Published addon contract:** native Storybook APIs, plain JSON, no Effect dependency or peer dependency.  
**Operating model:** open-source, offline-first, CI-native, vendor-neutral

> **Consumer-install update (26 October):** The Storybook addon is a self-contained read-only presentation adapter. Effect is private to the governance CLI/engine/MCP runtime. `pnpm add -D @example/storybook-governance` plus one line in `addons` is sufficient to render the addon; CI and MCP are entirely optional installs. See the [zero-friction distribution contract](#zero-friction-consumer-installation-and-distribution--normative-extension).

> **Versioning update (26 October):** The component contract, SemVer, breaking-change, consumer migration and release-approval requirements in the [API-grade versioning extension](#api-grade-versioning-and-release-governance--normative-extension) are mandatory. They supersede any lighter requirements in earlier milestones. Component contract versions are not equivalent to separately installable package versions.

## Codex: your assignment

You are the implementing lead engineer. Build a **working vertical slice** of a design-system governance tool, not merely an architecture document or a polished status-badge demo. First inspect the repository and preserve existing conventions if this is not an empty repo. If it is empty, bootstrap the workspace described here.

Deliver tested packages, a Storybook demo, a reproducible GitHub Actions example, a usable CLI, a read-only MCP server, docs, and screenshots if your environment supports them. Explain decisions, document trade-offs, and demonstrate failing and passing governance gates. Do not publish to npm, create external resources, or push commits without instruction.

## Product thesis

> **A design system should not claim that a component is production-ready. It should show the proof.**

Storybook is an excellent component development environment, but governance is larger than Storybook. We need a **design-system control plane** that sits between design work, code, test evidence, approvals, package releases, deployments and AI agents.

The tool should answer:

1. Which components are draft, candidate, stable, deprecated, or retired?
2. What evidence supports each component's current status, and is that evidence current?
3. What blocks a proposed move to stable?
4. Which versions were published, which versions were deployed to which applications and environments, and what is still unknown?
5. Which components are safe for an AI coding agent to use?
6. Who approved an exception, why, and when does it expire?

**Differentiator:** Etch-style badges present manually assigned labels. Our system produces **auditable governance decisions** from versioned policy and verifiable evidence, exposed consistently through a local CLI, Storybook, CI and MCP.

## Principles and non-negotiables

- **One engine, many interfaces.** Core evaluation must not import Storybook, GitHub or MCP libraries. Published Storybook UI must not import the runtime engine.
- **State dimensions are independent.** Lifecycle/maturity is **not** quality; quality is **not** release; release is **not** production deployment; production deployment is **not** adoption.
- **No false production claims.** A Storybook tag, green build or published package does not prove a consumer application deployed a specific version. Unverified means `unknown`, not `production`.
- **Evidence over editable badges.** Storybook parameters can link a story to a component identity, but must not be allowed to turn a failing check into a passing one.
- **Offline first.** Core validation, report generation and local MCP work from checked-in files and generated CI artifacts. No mandatory SaaS account or external database.
- **Fail closed for release gates.** Missing, expired or mismatched required evidence must prevent promotion. Keep `missing` separate from a known `failed` result.
- **Human accountability.** An agent may explain failures or propose fixes. It may not grant approvals or silently waive policy.
- **Deterministic and inspectable.** JSON formats and policies are versioned; results stable when evaluated against the same inputs and clock.
- **Framework-neutral core.** React Storybook is the reference adapter, not a constraint on the model.
- **Small first vertical slice.** Resist a hosted dashboard, telemetry service or plugin marketplace until the local tool works end to end.
- **Zero-friction consumer installation.** Installing the Storybook addon must not require Effect, the governance CLI, the MCP SDK, a backend, a database, or extra React peer packages. The sole expected peer is an already-installed compatible Storybook.

## Domain model

Model at **component** level, not story level. One component can have many Storybook stories. Use explicit, stable IDs that survive moves and renames (e.g. `ui.button`, `ui.select`). Do not use generated Storybook story IDs as long-term identities.

### Independent state axes

| Axis | Proposed states | Authority |
| --- | --- | --- |
| `lifecycle` | `draft`, `candidate`, `stable`, `deprecated`, `retired` | Reviewed version-controlled registry plus transition policy |
| `check` | `passed`, `failed`, `missing`, `expired`, `waived` | Evidence validator and active waiver policy |
| `gate` | `ready`, `blocked`, `insufficient_evidence` | Pure policy evaluation |
| `publication` | `unknown`, `unpublished`, `published` | Registry / package release evidence |
| `deployment` | Per `{app, environment, version}` with `verified`, `unknown` | Trusted deployment record and artifact/version match |
| `adoption` | `unknown` or verified consumer references | Consumer manifest or later repository analysis |

Do not flatten these into a universal single traffic-light status. A deprecated component may be deployed; a stable component may lack a verified deployment; a passing component may not have human approval.

### Core objects (Effect Schema; exported JSON Schema where useful)

- `ComponentRecord`: `id`, display name, package name, owner(s), source location, Storybook story references, lifecycle, optional Figma URL and replacement ID, optional documentation URL. Add component contract version and public export path per the normative versioning extension.
- `Evidence`: schema version, stable evidence ID, component ID, check kind, outcome, source/producer, repo and commit SHA, optional artifact digest, observed time, optional expiry, source run URL, optional structured diagnostics. Include provenance/trust metadata; do not imply that any random JSON file is trusted.
- `Policy`: versioned requirements per target lifecycle and optional deployment gate, evidence freshness limits, accepted producers, waiver rules and exception boundaries.
- `Waiver`: component ID, check, owner/approver, reason, issued time, expiry, reference to a reviewed PR or issue. Treat author/approver identity as unverified unless backed by a trusted integration.
- `Decision`: component ID, target state, `ready | blocked | insufficient_evidence`, per-check results, human-readable explanations, links to evidence, active waivers, evaluated policy version and source commit.
- `ReleaseRecord` / `DeploymentRecord`: package, immutable version/digest, consumer app, environment, commit, deploy job and evidence URL. Keep absent until implemented with real data. Store component contract versions and their digest in a verified release manifest.

Prefer discriminated unions, branded IDs/newtypes, exhaustiveness checking, explicit error types, no `any`, and tested pure functions. Effect is appropriate for validation and IO boundaries; do not wrap trivial pure code in unnecessary effects.

## Version-controlled inputs

Use a **single canonical registry file** for the MVP (e.g. `governance/components.yaml`) and an explicit policy file (`governance/policy.yaml`). Create matching Effect Schemas. Example shape (the implementation must choose and document the final exact schema):

```yaml
# governance/components.yaml
schemaVersion: 1
components:
  - id: ui.button
    name: Button
    package: "@example/ui"
    owners: ["@design-system"]
    lifecycle: stable
    source: "src/components/Button.tsx"
    stories: ["src/components/Button.stories.tsx"]
    figmaUrl: null

  - id: ui.select
    name: Select
    package: "@example/ui"
    owners: ["@design-system"]
    lifecycle: candidate
    source: "src/components/Select.tsx"
    stories: ["src/components/Select.stories.tsx"]

  - id: ui.alert
    name: Alert
    package: "@example/ui"
    owners: ["@design-system"]
    lifecycle: stable
    source: "src/components/Alert.tsx"
    stories: ["src/components/Alert.stories.tsx"]

  - id: ui.legacy-alert
    name: LegacyAlert
    package: "@example/ui"
    owners: ["@design-system"]
    lifecycle: deprecated
    replacementId: ui.alert
    source: "src/components/LegacyAlert.tsx"
    stories: ["src/components/LegacyAlert.stories.tsx"]
```

```yaml
# governance/policy.yaml
schemaVersion: 1
policies:
  stable:
    requiredChecks:
      - id: ownership
      - id: documentation
      - id: unit-test
        maxAgeHours: 24
      - id: accessibility
        maxAgeHours: 24
      - id: design-approval
        trustedProducer: github-review
      - id: visual-review
        trustedProducer: visual-ci
    blockOnMissing: true

  deprecated:
    requiredFields: [replacementId]

waivers:
  enabled: true
  maxDurationDays: 14
  disallowFor: [ownership]
```

**Important:** The example above is a *target policy*, not a license to generate fake design or visual approvals. The first working fixture may use an explicitly documented local demo policy requiring only the checks with actual verifiable adapters. Tests may use simulated evidence, but it must be marked as test data and never accepted as proof in real CI.

Stories link to the registry by reference only:

```ts
// illustrative CSF metadata; use the project's actual Meta type
const meta = {
  component: Button,
  parameters: {
    governance: { componentId: 'ui.button' },
  },
};
export default meta;
```

Do not duplicate editable lifecycle/quality/deployment fields in story parameters. If mapping can be reliably derived from source or Storybook manifests, support that as a convenience, never as the stable identity.

## Zero-friction consumer installation and distribution — normative extension

### Public developer experience (P0; acceptance test, not merely aspiration)

A team with an existing supported Storybook installation must need **only**:

```bash
pnpm add -D @example/storybook-governance
```

```ts
// .storybook/main.ts — add to the existing `addons` array; retain other config
const config = {
  addons: ['@example/storybook-governance'],
};
export default config;
```

This snippet illustrates the **incremental change**, not a replacement for a framework-specific Storybook configuration. The addon must register itself through an official Storybook preset/manager entry and display the Governance panel immediately. No provider, Babel/Vite override, custom Storybook manager file, additional package, environment variable, hosted account or code generation step is required for installation. Use ESM-compatible addon packaging for the supported Storybook major.

On first run **without a governance report**, display a useful non-blocking onboarding/empty state (`unverified — governance report not configured`) and component identity where available. Do **not** manufacture a green approval or deployment badge. Optional claimed metadata, if supported, must explicitly read `declared / unverified`, never `verified`.

**Advanced features opt in independently:**

- Local/CI enforcement: install `@example/governance-cli` in the repository or invoke the version-pinned CLI in CI to produce a JSON report. Its internal Effect runtime may be a **normal private dependency of the CLI**, never an addon peer dependency.
- Agent access: install/run `@example/governance-mcp` separately. It may depend on the engine, Effect, and the MCP SDK without affecting the Storybook install.
- Report ingestion: opt in to a same-origin static JSON report produced by CI/CLI or a validated explicitly configured report URL. The addon only reads this report; it does not evaluate policies or fetch credentials. No report is a supported state, not an install error.

### Strict packaging boundary

```text
@sample/storybook-governance           (published, presentation only)
  └── Storybook manager UI + preset
      └── plain versioned governance-report.json + types

@sample/governance-cli                 (separate optional installation)
  └── governance policy/core (Effect internal) → governance-report.json

@sample/governance-mcp                 (separate optional installation)
  └── governance policy/core (Effect internal) → same decisions
```

Use `@example/` consistently in the actual implementation; `@sample/` above is just a diagram. The report is the stable **wire contract** between evaluation and presentation: versioned, serializable JSON with ordinary JSON Schema, generated TypeScript types and a stable schema version. Types exported publicly must remain plain TypeScript (`Promise`, discriminated unions, strings, objects), **never** `Effect`, `Layer`, `Cause`, `Schema` or other Effect-specific types. The CLI and MCP may use Effect freely behind this boundary.

The addon must **not** make a runtime import from `packages/core`, `packages/versioning`, `effect`, `@effect/*`, `@modelcontextprotocol/*`, Node built-ins or the GitHub SDK. If the source uses shared types, use generated type-only definitions or a tiny dependency-free `packages/protocol` package whose published runtime dependency tree is free of the policy engine; prefer bundling protocol logic into the addon. Validate the JSON report at the boundary with a small, dependency-light validator, without shipping Effect Schema into the browser. Do not run the entire governance policy engine inside Storybook's manager or preview frame.

#### Target manifest for addon (illustrative)

```json
{
  "name": "@example/storybook-governance",
  "type": "module",
  "peerDependencies": {
    "storybook": "^10.0.0"
  },
  "dependencies": {}
}
```

This is the **desired consumer-facing dependency surface**, not a complete publishable `package.json` (build entry points, exports, files, metadata and package scripts are still required). Storybook 10 requires ESM addons and documents `storybook` as the peer dependency. Internal build/dev dependencies are allowed. Use Storybook's provided manager UI APIs rather than adding a React or framework peer dependency. Any unavoidable additional peer must be justified with measured evidence and approved as a spec exception, not introduced by default.

### Release and compatibility rules for our *own* addon

- Version the Storybook addon, CLI, MCP server and report schema independently; maintain a compatible-report-schema matrix. The addon must not require an identical CLI version to read a compatible report.
- Unknown *newer* schema major: show `unsupported report format`, not success; compatible older minor versions: render with graceful defaults. Document any schema support window.
- A Storybook major-version compatibility change is a deliberate addon SemVer event and must have installation tests. Do not add untested peer version ranges just for install convenience.
- Verify published tarballs, `exports`, ESM compatibility, bundled code and dependency trees instead of trusting the monorepo development build.

### Mandatory clean-consumer tests / performance budget

1. `npm pack` the addon and install the **packed artifact** into a fresh minimal Storybook 10 fixture via npm and pnpm (`strict-peer-dependencies=true`), without installing CLI, MCP, Effect, or other workspace packages.
2. The addon renders its panel with a missing-report empty state and with a valid versioned report; Storybook builds in both cases.
3. Verify `npm ls effect @effect/schema @modelcontextprotocol/server` (or equivalent dependency tree inspection) shows none *introduced by the addon* and inspect the manager/preview bundles for those imports; the package may not rely on globally installed undeclared workspace dependencies.
4. Confirm the only *intended* peer requirement is `storybook` for the supported major; no additional React, React DOM, Effect, Node adapter, MCP SDK, or CLI peers.
5. Add a CI check for unexpected non-Storybook runtime dependencies and a documented **incremental bundle size budget** (choose and justify a measured initial baseline; fail on material regression). Keep policy evaluation and report ingestion out of the preview iframe unless required.
6. Smoke-test empty state, malformed report, unsupported schema version, stale report, report-fetch failure, and proper accessible error messages. Optional advanced features must not prevent Storybook startup.
7. Test plain npm/pnpm installations *outside* the monorepo to catch workspace linking, hidden dependency and module-resolution failures.

**Never make the Storybook addon depend on the CLI to boot.** Governance must remain fully enforceable by CI even when the addon is not installed; conversely, the addon must render an honest read-only UI without CI configured.

## API-grade versioning and release governance — normative extension

### Mandate

Implement **contract-aware component governance** across code, design tokens, behavioral and accessibility expectations, releases, and consumers. No release should be declared safe solely because types compile, snapshots pass, or someone selects `stable` in Storybook.

#### The two-version rule — fundamental

Distinguish:

1. **Component contract version** — an audited SemVer `contractVersion` for a stable component ID (`ui.button@2.3.0`). Records the compatibility history of that specific component, design contract and declared public surface.
2. **Published package version** — the real installable version (`@example/ui@8.4.1`) that controls dependency resolution for consumers.

For a **single shared package**, component versions are **governance metadata**, not separately installable or independently selectable. The package's next SemVer bump must be at least the highest required bump across its changed exported components, tokens and package exports. Do not suggest a consumer can pin `Button@2.3.0` independently if they actually install `@example/ui@8.4.1`.

Use **one shared UI package** for the MVP. Separate installable packages (e.g. `@example/button`, `@example/select`) are an optional future publishing model, not an assumed capability. Component contract versions remain useful for audit and agent queries in either model.

Do not conflate **data schema versions** (`schemaVersion`), **governance policy revisions** (`policyVersion`), **component contract versions** (`contractVersion`), **published package versions**, **design/Figma revision IDs**, and **deployed consumer versions**. Preserve all separately.

### Compatibility contract

Declare, snapshot and diff the **public** interface of each component. The minimum model includes:

- Stable component ID, owning team, package/export path, first published and current contract versions, lifecycle and replacement ID.
- TypeScript public exports: props, required/optional props, types, variants, event callbacks and documented imperative/ref APIs.
- Documented defaults, controlled/uncontrolled behavior, emitted events, focus/keyboard rules and a11y semantics/ARIA contracts.
- Documented slots, subcomponents, selector hooks, CSS custom properties, supported themes, responsive behavior and required design tokens.
- Documented rendering/SSR and hydration expectations, supported React/framework/runtime peer-dependency ranges.
- Visual/interaction baselines, with named stories/fixtures and review evidence. Pixel equality is neither a full compatibility proof nor always required for intentional improvements.

**Public versus private boundary:** do not classify an internal DOM wrapper or undocumented CSS class as a breaking API by default; do classify changes to documented hooks or guarantees. Require explicit owner review of the boundary. If a team promises DOM/HTML behavior, it becomes contractual.

Snapshot published release contracts as immutable JSON with content hashes. Compare to the **latest applicable published stable version**, not only `main`/HEAD, and include all currently supported release lines if relevant. An unreleased working-tree version is not an authoritative baseline.

Example: `governance/contracts/ui.button.json` (illustrative schema; validate final format with Effect Schema):

```json
{
  "schemaVersion": 1,
  "componentId": "ui.button",
  "contractVersion": "2.3.0",
  "package": "@example/ui",
  "exportPath": "@example/ui/button",
  "lifecycle": "stable",
  "publicProps": {
    "variant": { "optional": true, "type": "primary | secondary", "default": "primary" },
    "disabled": { "optional": true, "type": "boolean", "default": false }
  },
  "behaviorContracts": ["keyboard.activation", "focus.visible"],
  "supportedPeers": { "react": "^18 || ^19" }
}
```

The JSON above illustrates intent. Generate type signatures from actual package declarations rather than manually maintaining a second contradictory TypeScript API. Store behavioral and visual declarations explicitly where extraction cannot prove semantics. Keep generated data separate from human-reviewed declarations.

### SemVer and classification policy

Version increases mean compatibility outcomes for **existing consumers**, not how much code changed.

| Type | Examples | Required next version |
| --- | --- | --- |
| **Major / incompatible** | Removed/renamed prop or export; new required prop; narrower type; changed documented default; altered callback meaning; changed keyboard/focus contract; breaking token rename; removed supported theme/framework; breaking layout of a documented contract | `(X+1).0.0` |
| **Minor / additive** | New optional prop with safe default; new variant/token/component/export; additive documented behavior with compatibility preserved; announced deprecation while old API remains functional | `X.(Y+1).0` |
| **Patch / compatible correction** | Backward-compatible bug fix, non-breaking performance fix or internal refactor; corrected visuals that preserve documented commitments | `X.Y.(Z+1)` |
| **No runtime release** | Documentation-only or test-only changes without changed distributed artifacts | No forced publish; still record governance event if relevant |

**Conservative rule:** A change to CSS/visual defaults, keyboard handling, focus order, semantic roles or component state can break consumers even when TypeScript signatures are identical. Automated tools can detect changes, not reliably classify all outcomes. `unknown` or ambiguous changes require explicit owner classification, visual/a11y review and evidence. They must not silently pass as patch.

A claimed `major` is permitted only with the required approvals and migration artifacts. Choosing `major` **does not** by itself make an unsafe change acceptable. Likewise, choosing `patch` cannot override a detected incompatibility.

SemVer applies strictly to **stable `>=1.0.0`** public contracts. For pre-1.0 components, use explicit `alpha`/`beta` channels and documented weaker guarantees; release gates must not quietly treat `0.x` as production-safe. A candidate component's proposed contract may be `1.0.0-rc.1` but it must not count as stable until approved.

#### Policy example (proposed; not an implemented config)

```yaml
# governance/version-policy.yaml
schemaVersion: 1
policyVersion: 1
versioning:
  strategy: shared-package
  releaseBaseline: latest-published-stable
  publicApiDiff: required
  changeset: required-for-distributed-change
  ambiguousChanges: block-until-classified
  packages:
    "@example/ui":
      stableRequires:
        - compatibility-report
        - changelog
        - owner-approval
        - evidence-provenance
      majorRequires:
        - design-system-owner-approval
        - consumer-impact-report
        - migration-guide
        - codemod-or-manual-migration-plan
        - compatibility-matrix
      deprecation:
        announceIn: minor
        minNoticeDays: 90
        minStableReleases: 2
        removeOnlyInMajor: true
        blockNewUseByDefault: true
      prereleaseTags: [next, beta, canary]
```

The notice policy above is a **proposed default**, not a claim about Stripe or a universal standard; allow organisational override only via reviewed, versioned policy. A deprecation window is a minimum, not automatic permission to delete a component with unprepared consumers.

### Machine-readable change classification

For every distributed change, emit a reviewed `ChangeRecord` with:

- changed component IDs and exported package IDs;
- previous and proposed component contract versions;
- baseline and candidate package versions/digests;
- `changeKind: major | minor | patch | none` and a structured impact set (`types`, `behavior`, `visual`, `a11y`, `tokens`, `runtime`, `exports`, `peers`);
- `detectedChanges` from automated tools, `declaredChanges` from authors, and any mismatch requiring resolution;
- linked issue/PR, reviewer attestations, changelog and migration docs;
- affected consumer inventory and confidence (verified, inferred, unknown);
- decision, policy revision, source SHA, expiry-bound exceptions and evidence references.

Use strongly typed domain models (`Effect/Schema`) and stable JSON contracts. Preserve original source and analysis provenance, not just a generated English summary.

#### Automated analyzers (start small but real)

- Generate TypeScript `.d.ts` for a candidate build and compare against the published baseline with a **public API report**, using API Extractor or an equivalent version-pinned tool.
- Detect added/removed/narrowed exported props, unions, types and export paths; report what was detected and what remains unproven. Add compile-time consumer fixture tests for known API shapes.
- Diff checked-in public token names/aliases, intended supported theme names and declared CSS variables.
- Report changes to CSF/visual stories for review, not as an automatic proof of semantic compatibility.
- Run a11y/interaction/keyboard fixtures for changed documented behavior, where implemented.
- Import a developer-authored Changeset for release intent. The policy engine, **not Changesets alone**, decides the minimum allowed bump.
- Reject changed public contracts without a release declaration; reject an insufficient bump; require a reasoned classification when static tools cannot decide.

Recommend `@changesets/cli` for version/changelog/publish workflow and `@microsoft/api-extractor` for TypeScript API reports; verify installed APIs before implementation. Neither tool fully understands behavioral/a11y/visual changes, so our policy engine must handle these review gates itself.

### Promotion, release and rollout gates

A release gate checks **the exact release candidate artifact**, not simply the branch status:

1. **PR check:** discover affected components; compare candidate to last published stable contracts; generate compatibility diff, recommended minimum bump, evidence and consumer impact.
2. **Classification:** author supplies Changeset/changelog; machine flags inconsistencies; domain owners sign off on unknown behavioral/visual changes.
3. **Protected review:** CODEOWNERS, design/a11y approval for affected surfaces, API owner for major, policy-owner approval for exceptions. Validate trusted GitHub reviewer identity; no unchecked `approved: true` flags.
4. **Release candidate:** build immutable tarball/manifests and verify types/exports/peers, regression tests, visual/a11y evidence and compatibility across supported consumer fixtures.
5. **Publish:** authorized release workflow checks approved artifact digest and required attestations; creates an immutable release manifest with package version and component contract versions. Git tag alone is not immutable proof of npm publication.
6. **Adoption and deployment:** ingest authenticated installed package/build manifests; verify app/environment digest or commit matches deployment. Published `!=` installed `!=` deployed.
7. **Monitor:** track consumers still on deprecated/unsupported contract versions; report upgrade opportunities and blocked migrations.

**Fail closed** for missing required provenance, incompatible bump, missing migration plan, untrusted reviewer, unavailable validation integration, stale evidence or changed artifact digest. Do not make package publishing a required milestone of the initial demo; demonstrate gate against local test artifacts and do not publish externally.

#### Support, deprecation and emergency changes

- Deprecate with warning, replacement link, owner, first-announced release/date and earliest eligible removal version/date. Preserve old behavior through the stated window.
- Removal only in a major release after the minimum window and a review of verified/inferred/unknown consumer impact. The report must distinguish known impacted consumers from unknown usage.
- Ensure automated lint rules can block new adoption of deprecated components; do not automatically break existing apps.
- If supporting multiple major lines, explicitly name maintained lines and backport policy. Do not claim support without a build/test/publish process.
- Emergency security/a11y fixes get an explicitly audited fast-track, with incident ID and owner approval. Prefer preserving API compatibility; a required breaking fix still needs an honest major version or a documented emergency exception, never a disguised patch.

### Version-aware Storybook and MCP

#### Storybook Governance panel must display

- Component **contract** version plus actual **package** version, with labels explaining the difference.
- Change timeline and last published contract digest; latest proposed changes and release gate.
- Breaking-change report, changed props/variants/tokens/keyboard guarantees, latest approvals and freshness.
- Changelog, migration guide/codemod link, supported versions, deprecation notice and planned removal date.
- Verified consumer adoption, where available; `unknown` otherwise. No made-up percentages.
- At least one demo where `ui.button` is stable but a proposed breaking change is **blocked** from a patch release.

#### MCP read-only tools to add

```text
get_component_contract(componentId, contractVersion?)
diff_component_contract(componentId, fromVersion, toVersionOrCandidate)
list_breaking_changes(packageId?, sinceVersion?)
explain_release_block(packageId, candidateVersion)
get_release_manifest(packageId, version)
get_consumer_compatibility(packageId, candidateVersion)
plan_component_migration(componentId, fromVersion, toVersion)
```

These query the **same deterministic core reports as CLI/CI/Storybook**. Migration plans can be derived suggestions, but state clearly which files and consumers are observed versus assumed. Do not grant approvals or publish from MCP in the MVP.

#### CLI additions

```bash
pnpm governance contracts snapshot --package @example/ui
pnpm governance contracts diff --package @example/ui --baseline latest-published-stable
pnpm governance release plan --package @example/ui --format json
pnpm governance release check --package @example/ui --candidate 8.4.1
pnpm governance deprecations report
```

These commands are **proposed interfaces**. Codex must document implemented syntax and avoid hardcoded pretend network lookups. Allow an explicit, verifiable local baseline fixture for the offline MVP.

### Milestone changes (supersede original handoff where inconsistent)

- **M0:** Add contract/release/domain schemas and component-vs-package version semantics; immutable fixture release baselines; pure SemVer bump evaluator; tested transition invariants.
- **M1:** Add **real static export/type compatibility diff**, Changesets intent validation, release plan/check CLI, GitHub Actions required check, and Storybook component contract + release-block panel. Demonstrate a breaking change blocked at patch/minor and allowed through a correctly reviewed simulated major with migration guidance.
- **M2:** Extend MCP with read-only contract diff, release block reasoning, migration reporting and compatibility data; cross-interface evidence parity tests.
- **M3:** Verified GitHub reviewer attestations, published npm artifact provenance, consumer dependency graph, cross-repo canary builds, design-token/visual/a11y deeper checks, rollout and support-line automation. Label missing external integrations `unverified` rather than passing them.

Do not let M1 expand into a hosted registry, a full design-token diff engine or cross-repo service. Put hard release constraints into the early useful slice; integrations and broad analysis can follow later.

### Additional acceptance tests (required)

1. A removed exported prop, renamed export or newly required prop **cannot** ship as a patch or minor to stable consumers.
2. Changing a documented default/focus contract triggers human classification even when TypeScript API is unchanged.
3. New optional prop with backward-compatible default is normally minor; compatible bug fix is patch.
4. A major version does not pass the gate unless required owners, consumer report, migration guidance and evidence are present.
5. Per-component contract versions and package versions display separately; a shared-package release uses the highest required bump across changes.
6. PR version declaration mismatching detected change fails CI; a missing Changeset fails when distributed artifacts changed.
7. Stale API reports, mismatched SHAs, untrusted approvals and a release artifact changed after review fail closed.
8. Deprecated components are blocked for **new adoption** while existing users receive an explicit migration window.
9. CLI, Storybook and MCP agree on identical release eligibility and reasons given identical inputs.
10. No local demo report claims npm publication, actual consumer usage or production deployment without verifiable evidence.
11. Every published baseline is immutable and addressable by package version and digest.
12. Compatibility rules have tests across prerelease, `0.x`, `1.x` and new major release lines.

## Expected monorepo layout

```text
.
├── apps/
│   └── storybook-demo/           # real components and stories, visual fixture
├── packages/
│   ├── core/                     # private runtime: Effect schemas, policy evaluator, reports
│   ├── protocol/                 # generated plain JSON report/types; no Effect runtime imports
│   ├── versioning/               # component contracts, API diff, SemVer and release gates
│   ├── cli/                      # validate/evaluate/report/evidence commands
│   ├── storybook-addon/          # public: zero-friction manager UI; no core/Effect runtime deps
│   ├── mcp/                      # stdio server, read-only governance tools
│   └── github/                   # GitHub adapter (thin; phase 2 as needed)
├── governance/
│   ├── components.yaml
│   ├── policy.yaml
│   └── evidence/                 # local demo fixture data only
├── examples/
│   └── github-actions/
├── docs/
│   ├── architecture.md
│   ├── governance-model.md
│   ├── threat-model.md
│   └── getting-started.md
├── .github/workflows/ci.yml
└── README.md
```

Use pnpm workspaces. Add Turborepo only if it reduces build friction or is already present; avoid tooling for its own sake. Use strict TypeScript, **Effect 4 (`effect/Schema`) only in private backend/tooling packages**, dependency-free generated report types for the public addon, Vitest, and Storybook 10 with a React/Vite demo. Use current official addon and MCP SDK APIs verified at implementation time; do not copy legacy Storybook 7/8 addon patterns or MCP SDK v1 snippets.

## Required interfaces

### 1. Core engine (`packages/core`)

Pure functions that:

- Parse and validate component registry, policies, waivers and evidence.
- Enforce unique component IDs, valid references, checked-in source paths, allowed transitions and known checks.
- Validate evidence freshness, component and commit/digest match, expiry and accepted producer type.
- Separate *reported outcome* from *verified provenance*. A report from an untrusted or unconfigured producer cannot satisfy a trusted gate.
- Evaluate readiness for a requested target lifecycle, with one reason per failed/missing rule.
- Output structured report schema with a human-readable explanation and stable component ordering.
- Accept an injected evaluation timestamp; never tie tests to wall-clock time.
- Reject policy downgrade by default for protected paths unless reviewed by designated owners (the actual GitHub enforcement is a CI/org settings concern and must be documented).

Test property-like invariants: identical inputs -> identical decisions; stale evidence != pass; missing evidence != pass; an expired waiver != pass; deployment unknown != deployed; one story cannot create a second component identity.

### 2. CLI (`packages/cli`)

Provide a single command, working inside the repo without a hosted service. Proposed UX:

```bash
pnpm governance validate
pnpm governance evaluate --target stable --format json --out ./artifacts/governance.json
pnpm governance evaluate --target stable --format markdown
pnpm governance report --format markdown
pnpm governance evidence import --format <supported-format> --file <path>
pnpm governance mcp
```

Adjust command naming if needed, but document and test the final interface. Required behavior:

- Human-readable terminal output with clear component identifiers, policy outcomes and remediation.
- Stable machine-readable JSON schema and Markdown report; a GitHub Actions summary can reuse Markdown.
- Non-zero exit for missing/failed mandatory checks in gate mode; errors distinct from policy failures.
- `validate` checks input shape without requiring online services.
- Support importing at least one **real** machine report type in the first milestone (for example a Vitest JSON report). Do not treat the mere presence of a report file as a passing test.
- Report `not configured` / `unverified` for unavailable providers. Never invent adoption or deployment data.

### 3. Storybook addon (`packages/storybook-addon`)

**Apply the zero-friction installation and strict packaging extension above.** This package must be installable and render without any CLI, core, Effect or MCP package. Use Storybook's supported manager addon API. Provide:

- A **Governance** panel for the selected component with lifecycle, policy gate, check evidence, owning team, missing requirements, waivers and source links.
- Compact sidebar marker showing the governance gate; tooltips must distinguish draft/stable maturity from failing/missing checks.
- A clear and visually honest `unverified` state rather than a false green "Production" tag.
- Filter/search behavior that uses Storybook's existing tag/filter capabilities where appropriate instead of reinventing them.
- A straightforward way for maintainers to supply the generated governance report (static JSON bundled/served in Storybook). No private CI token or filesystem access from browser-side code.
- Graceful behavior for unmapped stories and when the report is missing, outdated or version-mismatched. Missing report must be a functional no-config onboarding state, not a startup failure.
- Dark and light mode, accessible labels, keyboard use and useful empty/error states.

**Technical caution:** Storybook manager `renderLabel`/sidebar customization and index data may change by version. Investigate the least invasive integration, test against the locked Storybook version, and prefer a usable panel over unsupported internals. Do not overwrite other addons' sidebar customization without care.

### 4. MCP server (`packages/mcp`)

Use the **MCP TypeScript SDK v2** (`@modelcontextprotocol/server`), starting with local **stdio** transport. Provide read-only tools that query the **same core evaluation engine and reports**, not a separate database or untrusted language model summary:

```text
list_components(filters?: { lifecycle?, gate?, owner? })
get_component(componentId)
get_component_evidence(componentId)
evaluate_component(componentId, targetLifecycle)
explain_governance_failure(componentId, targetLifecycle)
get_design_system_report()
list_approved_components()
```

Each response should return structured, versioned data with URLs/references where available. `list_approved_components` must mean **policy-compliant for the requested use case under the configured approval policy**, not merely marked `stable` or passing tests. If the demo policy does not verify human approvals, label the result `eligible_under_demo_policy` rather than `approved`. If release/deployment/adoption is unknown, say so explicitly.

Do **not** duplicate Storybook's existing MCP component-documentation, story-preview or test-running tools. Let users run the Storybook MCP alongside our governance server. A remote/authenticated MCP transport is a later feature; stdio is sufficient for MVP. No mutating actions or automatic approval grants.

### 5. CI/CD integration

The `governance evaluate` CLI must work in GitHub Actions after tests have run. Deliver:

- Example `.github/workflows/ci.yml` running validation, tests, supported evidence import, evaluation and Storybook build.
- A Markdown GitHub Job Summary and annotations when gates fail. Use basic GitHub Actions output conventions first; a full Checks API GitHub App is not needed for MVP.
- Read-only/default-minimum permissions. Explain which additional permission an optional GitHub review/deployment adapter needs.
- A report artifact (JSON and Markdown) associated with a commit SHA and build ID.
- A check that failing governance exits non-zero and blocks a required check when branch protection is enabled.

**Design-approval verification:** it requires a **trusted** source such as a review by a designated owner fetched through the GitHub API, not a field set by a contributor. The MVP may show this as `not configured` and include the integration in the next milestone. Policy changes and waiver changes must be review-protected via CODEOWNERS and repository rules.

**Deployment verification (next milestone):** ingest GitHub Deployment Statuses or an application-emitted release manifest containing immutable component package versions, commit SHA and/or artifact digest, app name and environment. Only claim `verified in production` when the deployed application and published artifact/version can be matched to trusted records. Do not infer deployment from merged PRs, Storybook publish jobs or npm releases.

### 6. Optional extensions after the MVP

- Figma adapter: component IDs and references, design approval, token/geometry comparisons, evidence from the planned Pixel Perfect workflow.
- Jira adapter: ticket links and reviewer/approval evidence (never equate ticket closure to design sign-off automatically).
- Chromatic or other visual CI adapter: import provider-issued review outcomes and deep links; do not take over screenshot diffing.
- Consumer adoption: parse application lockfiles/build manifests and join installed package versions to component package exports. If inferred from static import analysis, mark coverage and uncertainty.
- Owner/team notification and change history backed by SQLite through a repository or hosted collector, while retaining filesystem mode.
- Agent-assisted remediation: read-only findings first, then opt-in PR proposals with explicit human review.
- Policy inheritance per organisation/repo/component, signed provenance and richer decision audit history.

## UX model and sample states

Build a demo with at least these visible cases, using test/demo evidence with obvious labels where real external proof is not available:

| Component | Lifecycle | Gate | Deployment | Explanation |
| --- | --- | --- | --- | --- |
| `ui.button` | stable | ready | unknown | Meets local demo policy; no consumer deployment evidence |
| `ui.select` | candidate | blocked | unknown | Accessibility issue or required test failure |
| `ui.legacy-alert` | deprecated | blocked for new adoption (context-specific gate) | unknown | Replacement is `ui.alert`; existing consumers may be allowed under policy |
| `ui.unmapped` (optional) | unknown | insufficient evidence | unknown | Story not linked to registry |

In the Storybook panel, show a dense-but-readable evidence table with: **check / result / age / producer / evidence link / next action**. Add a one-click copyable component ID and a clear explanation of what the badge does *not* prove. Avoid misleading composite scores such as "94% production ready".

## Milestone sequence — implement, don't merely describe

### M0 — Repository and domain

- Workspace, lint/typecheck/test/build scripts, MIT license, documentation skeleton.
- Effect Schema domain model and registry/policy parser.
- Stable component IDs and fixture data.
- Pure policy evaluator and a thorough Vitest suite.
- Component contract/release schemas; audited contract-versus-package SemVer semantics; immutable offline release baseline fixtures and pure bump-rule tests.

**Exit:** Evaluate a component from the CLI and get a stable, correctly reasoned decision, including a failing case.

### M1 — End-to-end local governance

- CLI validate/evaluate/report.
- Import a genuine unit-test report with commit association.
- GitHub Actions job showing successful and failing gates.
- Storybook React demo + Governance panel + sidebar marker, plus no-report first-install onboarding and clean-consumer tarball smoke tests.
- Clearly separate lifecycle and gate state in UI.
- Implement the normative component public-API diff and required Changeset/release gate. Surface proposed versus released contract versions, incompatible changes and remediation in Storybook; block a breaking patch/minor.

**Exit:** A failing test or missing mandatory evidence blocks the CLI and is visible in Storybook from the generated report.

### M2 — Agent-facing access

- MCP v2 stdio server wired to the core.
- Tools above plus version-aware release/contract read-only queries, stable response contracts, tests with an MCP client.
- Setup instructions for Codex and other standard MCP clients.
- One end-to-end demo that answers: "Why can't Select move to stable?" from the same underlying data used by CI and Storybook.

**Exit:** MCP and CLI return identical lifecycle **and release/version compatibility** conclusions for the same input data.

### M3 — Verified external evidence (follow-up, only if M0–M2 complete)

- GitHub review verification and CODEOWNERS guidance.
- Release/deployment record ingestion.
- Provider boundary contracts for Figma/visual CI/Jira/adoption.
- SQLite audit adapter if justified by actual need.

**Exit:** Production deployment appears only after a real, reproducible provenance check against a recorded consumer application deployment.

## Test and security requirements

- Unit tests for schemas, transitions, gate precedence, freshness, waivers and deterministic output.
- Integration tests for CLI exit codes, JSON/Markdown structure and import adapters.
- Storybook addon smoke tests (render selected component, missing report, outdated report, accessible UI) **plus published-tarball tests in clean Storybook projects verifying no Effect/CLI/MCP dependency or peer is required**.
- MCP client tests for tool discovery, input validation, failure paths and read-only behavior.
- End-to-end fixture test: import evidence -> run gate -> render same decision -> query through MCP.
- Bad or missing inputs produce actionable typed errors, not crashes or silent passes.
- Define a trust boundary: component authors can edit story metadata; they cannot impersonate trusted CI, reviewer or deployment records.
- No hardcoded tokens, no browser-exposed secrets, no shelling out to arbitrary user-provided commands, no telemetry by default.
- Gate errors and provider outages must not be converted into green statuses.
- Explain the limitation that GitHub Actions workflows, policy files and CODEOWNERS also need branch protection / required reviews; the tool alone cannot guarantee organisational approval integrity.

## Required deliverables and acceptance criteria

1. `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` succeed on a clean checkout.
2. README provides copy-paste commands to launch the Storybook demo, run `governance evaluate` and connect an MCP client. **Separate "Storybook addon only" and "enable CI/MCP" quick starts.**
3. At least three components exhibit different lifecycle and gate outcomes.
4. A passing and a blocked policy decision are reproducible without private credentials or a paid service.
5. A missing or expired required check cannot become `ready`.
6. Storybook UI and MCP reports match the CLI decisions for the same report snapshot.
7. A simulated release/published marker **never** implies production deployment.
8. The generated report references its policy version, commit SHA and evidence provenance.
9. CI documents exactly how the required governance gate blocks merging.
10. No fabricated third-party approvals, deployment proof or unsupported API calls are presented as real.
11. Provide brief screenshots or equivalent test evidence of the Storybook panel if the environment supports it.
12. Summarise implemented features, commands run, actual pass/fail results, files changed, and what remains for M3.
13. Public component contracts have SemVer histories distinct from published package versions.
14. A changed exported API cannot ship with an insufficient bump; verify removed props, new required props, additive props, behavioral change requiring review, and new-deprecation rules in tests.
15. The release gate checks the exact candidate artifact against an immutable published baseline and requires migration evidence for approved major changes.
16. The published addon installs into a fresh Storybook project with only a `storybook` peer; no Effect/core/CLI/MCP runtime or peer deps leak into consumer land. Empty-state Storybook works without report configuration, verified by a packed-artifact test.

## Your first execution steps

1. Inspect the working tree, package manager, existing Storybook, tsconfig, CI and tests. Do not overwrite working code.
2. Verify current library and API contracts from official sources. Choose compatible pinned dependency versions. **Known reference points as of October 2026:** Storybook's addon system uses `storybook/manager-api`; official `@storybook/addon-mcp` exists; MCP TypeScript SDK v2 uses `@modelcontextprotocol/server`; Effect 4 exposes `effect/Schema`.
3. State a compact implementation plan and the exact MVP boundary, then **start coding**.
4. Implement M0 -> M1 -> M2 in sequence, testing after each slice.
5. If time or access blocks an external adapter, leave a typed provider boundary and document `unverified`; never stub a fake success.
6. Finish with a demo script and evidence of working commands, not a broad proposal.

## References for the implementation

- Storybook addon API: https://storybook.js.org/docs/addons/addons-api
- Storybook 10 addon migration/peer and ESM packaging: https://storybook.js.org/docs/addons/addon-migration-guide
- Storybook presets: https://storybook.js.org/docs/addons/writing-presets
- Storybook tags and filters: https://storybook.js.org/docs/writing-stories/tags
- Storybook MCP and manifests: https://storybook.js.org/docs/ai
- Storybook MCP API: https://storybook.js.org/docs/ai/mcp/api
- MCP TypeScript SDK v2: https://ts.sdk.modelcontextprotocol.io/v2/
- Effect v4 Schema: https://effect.website/docs/v4/schema/introduction
- GitHub Deployment Statuses: https://docs.github.com/en/rest/deployments/statuses
- Existing Etch status addon (baseline, **not** the architecture): https://storybook.js.org/addons/%40etchteam/storybook-addon-status

---

**Definition of done for the first useful release:** a design-system maintainer can look at `Select` in Storybook, see that promotion is blocked and *why*, run the same check in CI, and ask Codex through MCP for the precise evidence and remediation steps. All three views agree, and none claims production deployment without proof.
