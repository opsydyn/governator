---
title: Onboard with an agent
description: Give an agent a scoped workflow for adopting Governator in an existing component library.
---

Use the repository's [governator-onboarding skill](https://github.com/opsydyn/governator/tree/main/skills/governator-onboarding). Copy that skill directory into your agent's supported project skill location, following your client's skill installation instructions. It is optional and does not install or activate an MCP client automatically.

Ask your agent:

> Inspect this component library and use Governator to propose the smallest useful setup. Reuse our component IDs, ownership and tests. Explain missing inputs and the first governance result.

Choose the addon for a Storybook panel, the CLI for evidence production, and MCP when the agent needs structured queries over a saved result. The skill uses published 0.1.0 capabilities. Repository development commands may require a later release.

The agent should inspect your project before proposing configuration and ask about missing ownership or policy decisions. Review the proposed files and authorize the work you want. If tests are deferred, setup can proceed while evidence remains pending.

A blocked component is a valid governance result. Ask for its missing checks and a concrete next action; do not substitute an easier policy just to change the badge.

Continue with [Storybook setup](../storybook-addon/) and [MCP snapshots](../mcp-snapshots/).

Development packages after 0.1.0 bundle the skill. Use `governator skill export --out .agents/skills/governator-onboarding` to copy it to an explicit new project-local destination; choose the directory your agent supports. New setup can use `init plan/apply` with explicit component owners, policy and mappings. See [agent workflow interfaces](../../reference/agent-workflow/) for the input contract and capability discovery.
