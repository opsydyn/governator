---
title: Agent workflow interfaces
description: Working-tree diagnostics and revision-checked registry edits in the next development version.
---

These commands are development additions after 0.1.0. Build the source CLI to use them; the published 0.1.0 onboarding flow uses `validate`, `check`, snapshot export and query.

`governator doctor --root PATH --format json` reads configuration and Git status without executing producers or writing files. Its schema-1 response labels the scope `working-tree-diagnostics` and includes findings with IDs, status, messages and suggested actions. Exit 1 means attention is needed; it is not a readiness decision. The initial implementation checks canonical configuration and Git cleanliness; it does not yet inspect report/snapshot freshness or verify dependencies.

`governator registry inspect` requires `--story-map`, `--story` and `--component`. Supply an existing server-generated story map. Use `--working-dir` for the Storybook project path relative to the repository root. The default registry is `governance/components.yaml`. Inspection returns the current component and content revision.

`governator registry update` takes the same context plus `--revision` and `--fields`. The fields file contains the complete proposed component object, not a partial patch. Use the inspected revision and preserve the selected story. The shared editor validates paths, component schema, story identity and revision before replacing the registry. Conflicting edits require a fresh inspection. These checks are not a cross-process filesystem transaction.

Review the Git diff after editing. Changes invalidate source-bound reports; collect fresh evidence, export a new snapshot and restart MCP when the source is committed. Creating a new component and editing CSF tags through the CLI are future extensions; existing local Storybook editors remain available.
