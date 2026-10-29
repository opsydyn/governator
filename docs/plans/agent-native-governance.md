# Agent-native governance implementation

Approved direction: deterministic policy core, CLI operations, immutable MCP reads, shared local editing, and a portable onboarding skill. Implementation of the agreed phase is complete locally. Automated qualification passed; manual acceptance is deferred until last. See [automated results](../qualification/agent-native-automated.md). These results do not authorize publication.

Delivered:

- Portable onboarding skill, published-package setup, and version-aware command discovery.
- Current documentation corrected for published 0.1.0 packages, public names, source versus installed demo, and historical synthetic experiments.
- Working-tree doctor diagnostics for canonical configuration, dependency resolution paths, Git source, selected report source/time, and fully loaded snapshot freshness. Findings include structured remediation descriptions. Dependency resolution does not prove runtime compatibility; saved reports do not recreate producer trust.
- Task-specific MCP descriptions and the preferred list_ready_components query, retaining list_approved_components with identical data. Development exposes fifteen tools; published 0.1.0 exposes fourteen.
- Shared registry metadata operations consumed by Storybook and CLI.
- Component registration and test mapping plans with before/after content and expected-revision application. Each command changes one existing file; no multi-file transaction or initial registry creation is claimed.
- Optional installed Storybook authoring adapter for tag inspection, preview and revision-checked updates. Ordinary CLI consumers do not depend on Storybook.
- Explicit snapshot refresh invoking the existing local producer, writing a fresh report and snapshot, and directing MCP restart. This produces governance-only snapshots; combined release snapshots use the existing report/release and export workflow. Refresh was subsequently exercised automatically in disposable test repositories.
- Architecture package map, command reference and recovery guidance.

Automated qualification completed:

- 825 tests across 79 files plus all workspace checks.
- Fresh packed CLI/MCP consumer with fifteen-tool parity.
- Independent npm/pnpm addon install/build and optional authoring adapter plan/update/read checks.

Remaining acceptance:

- Manual browser, keyboard, accessibility and onboarding walkthroughs, deferred until last.
- A separate publication decision after manual acceptance. [Remote staging and the hosted publishing rehearsal](../qualification/0-2-hosted-rehearsal.md) passed using the [qualified retained candidate](../qualification/0-2-candidate.md); no npm publication occurred.

Future ideas outside this phase: hosted control plane, background agents, writable MCP tools, automatic client activation and autonomous publishing. The single-maintainer release model remains selected; dual custody remains deferred.

The demo remains pinned to published 0.1.0. These source additions require a future release; no publication or push is part of this implementation.

## First-user completion supplement

The release scope also includes explicit first-project `init plan/apply`, bundled `skill export`, parser-backed `capabilities --format json`, and workflow-aware diagnostics. Setup uses maintainer-selected registry/policy/mapping inputs, requires explicit owners, and refuses existing destinations. Skill export targets an explicit new contained directory and does not configure an agent client. Neither operation claims a multi-file transaction.

[Automated onboarding qualification](../qualification/onboarding-automated.md) passed at implementation commit `d462bfd`: 830 tests across 80 files, all workspace checks, and an independent packed-consumer rehearsal. The subsequent [0.2.0 candidate](../qualification/0-2-candidate.md) passed fresh workspace checks and exact-archive consumer rehearsals. Manual acceptance stays last. No additional feature work is required by this enhancement scope.
