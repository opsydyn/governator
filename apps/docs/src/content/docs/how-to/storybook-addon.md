---
title: Connect the Storybook addon
description: Map stories to component IDs and serve a governance report.
---

Use an existing React/Vite Storybook project. The qualified development reference is Storybook **10.6.4**; the declared peer is `^10.6.4`. Other renderers and versions require separate qualification. The addon package is private `0.1.0`; obtain an actual local tarball and its dependencies before attempting consumer installation. Registry availability is not established.

In the source checkout the demo is already wired. For a configured consumer, add the package name to the existing `.storybook/main.ts` addon list:

```ts
addons: ["@governator/storybook-addon"];
```

Add governance parameters to the story's default export:

```ts
parameters: {
  governance: {
    componentId: "ui.button",
    reportUrl: "/governance.json",
  },
},
```

Generate a report using the [Vitest workflow](/how-to/vitest-evidence/), copy it into the static directory your Storybook already serves as `governance.json`, and rebuild static Storybook. Use the report's canonical component ID. Omit `reportUrl` to see onboarding without a report.

The addon reads strict schema 1 or 2 reports; it never evaluates policy or runs tests. It rejects stale reports older than 24 hours, malformed data, unsupported schemas and unknown identities as ready evidence. Fetch uses no credentials and rejects redirects. Report URLs must be same-origin.

Schema 2 displays reported evidence producer, provenance, observation time, age at evaluation and optional source. Schema 1 metadata is unknown. HTTP(S) sources without credentials can be links; relative and unsafe sources remain text. No evidence source is fetched. Only use reports from a producer you trust: validation cannot authenticate JSON.

The addon has Storybook as its sole peer and no runtime engine, Effect, CLI or MCP dependency. See [report contracts](/reference/report-schemas/) for reader compatibility.
