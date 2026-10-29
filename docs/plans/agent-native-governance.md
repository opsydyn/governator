# Agent-native governance implementation

Approved direction: deterministic policy core, CLI operations, immutable MCP reads, shared local editing, and a portable onboarding skill. Implementation of the agreed phase is complete locally. Behavioral qualification is deferred by the maintainer; static validation does not qualify behavior for publication.

Delivered:

- Portable onboarding skill, published-package setup, and version-aware command discovery.
- Current documentation corrected for published 0.1.0 packages, public names, source versus installed demo, and historical synthetic experiments.
- Working-tree doctor diagnostics for canonical configuration, dependency resolution paths, Git source, selected report source/time, and fully loaded snapshot freshness. Findings include structured remediation descriptions. Dependency resolution does not prove runtime compatibility; saved reports do not recreate producer trust.
- Task-specific MCP descriptions and the preferred list_ready_components query, retaining list_approved_components with identical data. Development exposes fifteen tools; published 0.1.0 exposes fourteen.
- Shared registry metadata operations consumed by Storybook and CLI.
- Component registration and test mapping plans with before/after content and expected-revision application. Each command changes one existing file; no multi-file transaction or initial registry creation is claimed.
- Optional installed Storybook authoring adapter for tag inspection, preview and revision-checked updates. Ordinary CLI consumers do not depend on Storybook.
- Explicit snapshot refresh invoking the existing local producer, writing a fresh report and snapshot, and directing MCP restart. This produces governance-only snapshots; combined release snapshots use the existing report/release and export workflow. No refresh was executed while tests were deferred.
- Architecture package map, command reference and recovery guidance.

Acceptance work still deferred:

- Behavioral checks for registration, mapping, metadata/tag conflicts, malformed inputs, stale source/evidence, aliases, producer failure and snapshot refresh.
- Skill onboarding in a fresh consumer, including intentionally missing configuration and deferred test execution.
- Clean packed-consumer qualification of the next release, including absence of Storybook dependencies from ordinary CLI/MCP installs and optional authoring availability.

Future ideas outside this phase: hosted control plane, background agents, writable MCP tools, automatic client activation and autonomous publishing. The single-maintainer release model remains selected; dual custody remains deferred.

The demo remains pinned to published 0.1.0. These source additions require a future release; no publication or push is part of this implementation.
