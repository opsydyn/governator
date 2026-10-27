# Governanator Governance addon

Read-only Storybook manager panel. Local preview package; private and unpublished.

Add `@governanator/storybook-addon` to `.storybook/main.ts` addons. Requires Storybook 10.6.4 or a compatible 10.x version. React/Vite 10.6.4 is the qualified renderer; other renderers are unqualified.

Set `parameters.governance.componentId` on each component's stories. Optionally set `parameters.governance.reportUrl` to a same-origin JSON report path. Without a report the panel shows onboarding; Storybook still works. Reports older than 24 hours, malformed reports, unsupported schemas and unknown IDs never show a ready gate. Fetch uses no credentials and rejects redirects.

The panel displays the snapshot's readiness and optional API compatibility independently. It performs no policy evaluation and grants no approval. Provenance and publication/deployment/adoption remain visible. Only configure reports produced by an engine you trust; schema validation does not authenticate a JSON file.

The browser bundle has no runtime dependency on the CLI, engine, Effect, Node or MCP. Storybook is the sole peer. The manager build supplies React. Bundle budget: 128 KiB raw / 16 KiB gzip.

The addon accepts strict schema 1 and schema 2 reports. Schema 2 shows each selected evidence ID with its reported producer and provenance, canonical UTC observation time, age in seconds at report evaluation, and optional source. Schema 1 details and missing sources are explicitly unknown. Reported metadata does not authenticate producers, and age at evaluation is not a live freshness guarantee. Existing report expiry and reload behavior applies to both versions.

Source references are displayed as text except absolute HTTP(S) URLs without credentials, which are keyboard-accessible links. Relative artifact paths and unsafe schemes remain escaped text. The addon does not fetch evidence sources. Older schema-1-only readers reject schema 2; generate schema 1 for those consumers (the CLI defaults to schema 1; use `--report-schema 2` to opt in).
