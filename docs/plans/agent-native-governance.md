# Agent-native governance progress

Approved direction: deterministic policy core, CLI operations, immutable MCP reads, shared local editing, and a portable onboarding skill. Tests are explicitly deferred by the maintainer; static validation does not qualify behavior for publication.

Implemented locally:

- Published-package onboarding guidance and a portable skill under skills/governator-onboarding.
- Corrections to current README/docs release status and public package names.
- Read-only working-tree doctor diagnostics, distinct from evidence production.
- Task-specific MCP descriptions, including the legacy approved-components terminology.
- Shared registry metadata editing used by Storybook and CLI inspect/update commands, preserving existing revision and path checks.

Remaining before the phase is complete:

- Doctor dependency, report and snapshot freshness diagnostics with explicit source identities.
- A clearer ready-components API alias while retaining the legacy tool name.
- New-component registration and mapping operations with previewable changes.
- CSF tag editing through a framework-specific adapter; avoid adding Storybook to ordinary CLI consumers.
- Explicit snapshot refresh workflow and structured remediation actions across interfaces.
- Review all current docs for historical qualification language and update the architecture package map.
- Behavioral qualification of the skill, diagnostics and editing workflows when tests resume. Test working-tree changes, conflicts, stale inputs and consumers using published packages.

No release or publication is authorized by this work. The demo remains pinned to published 0.1.0; source additions do not appear in that installed release.
