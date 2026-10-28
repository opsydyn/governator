---
title: Connect the Storybook addon
description: Map stories to component IDs and serve a governance report.
---

Use an existing React/Vite Storybook project. The qualified development reference is Storybook **10.6.4**; the declared peer is exactly `10.6.4`. Other renderers and versions require separate qualification. The addon package is private `0.1.0`; obtain an actual local tarball and its dependencies before attempting consumer installation. Registry availability is not established.

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

With a current report, open **Find components** in the Governance panel to search component IDs, packages or owners and filter readiness decisions. The default view shows blocked and insufficient-evidence decisions. The list is limited to the first 100 matches; narrow the search to find others. Readiness, release and API compatibility remain independent. When local CSF story source declares a literal `parameters.governance.componentId`, the list offers links to matching stories. Unsupported dynamic or ambiguous declarations stay unlinked.

Use the **G** toolbar control to filter the sidebar by readiness in the selected story's report: all, needs attention, blocked, missing evidence or ready. It combines with Storybook's native tag filters. Unmapped stories, ambiguous documentation entries and Storybook error entries may remain visible. The control resets to all when the selected report changes or is observed missing, invalid or expired, or when its mapping is unavailable. Reopen or reload the Governance panel to check an updated report; a failed toolbar request retries when the window regains focus. Filtering is disabled when composed Storybooks are present. The filter is navigation, not release approval.

On React/Vite Storybook, the addon builds a separate source mapping without adding tags to the sidebar filter. Literal metadata on object and direct function stories is supported. Composed Storybooks, custom indexers and dynamic or ambiguous source may not provide links. The mapping is not evidence or approval. Rebuild or restart Storybook after configuration changes; unavailable mappings leave stories unlinked.

Schema 2 displays reported evidence producer, provenance, observation time, age at evaluation and optional source. Schema 1 metadata is unknown. HTTP(S) sources without credentials can be links; relative and unsafe sources remain text. No evidence source is fetched. Only use reports from a producer you trust: validation cannot authenticate JSON.

The addon has Storybook as its sole peer and no runtime engine, Effect, CLI or MCP dependency. See [report contracts](/reference/report-schemas/) for reader compatibility.

## Edit descriptive tags in local Storybook

For React/Vite 10.6.4, enable the optional local development writer in `.storybook/main.ts`:

```ts
import { tagEditor } from "@governator/storybook-addon/tag-editor";

// Add to your existing configuration object:
viteFinal: async (config) => ({
  ...config,
  plugins: [...(config.plugins ?? []), tagEditor()],
}),
```

In a story's Governance panel, add or remove descriptive tags and select **Save tags**. The editor changes the static component tags in that story file. Use Storybook's sidebar tag filter to find matching stories. Review and commit the changed file through your normal workflow; tags do not change a policy decision or grant approval.

Unsaved edits stay in memory when you switch stories or hide the addon panel and are restored when you return. Save or discard them before opening another story from **Find components**. If the file changed, discard the draft and reload before saving. Drafts do not survive a page reload.

This editor supports static CSF metadata and literal string tag arrays. It preserves built-in and negated tags, rejects unsafe or unsupported files, and asks you to reload if its revision check detects another edit. It serializes its own writes, but cannot lock unrelated external editors. Tags apply to the selected story file; other files for the same component are not changed. Static Storybook builds and setups without the opt-in plugin show indexed tags read-only.
